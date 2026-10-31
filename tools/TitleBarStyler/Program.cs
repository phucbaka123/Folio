// TitleBarStyler: restyles the title bar of every normal top-level window.
//  1. DWM: sets caption color, caption text color, border color and rounded corners.
//  2. Overlay: draws rounded min / max / close buttons (explorer-redesign-spec.md, section 1)
//     over each window's native caption buttons and forwards clicks as WM_SYSCOMMAND.
// Windows that draw their own title bar (browsers, Electron apps) are excluded by default.
// Targets C# 5 so it builds with the csc.exe that ships with Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Log
{
    public static string FilePath;
    public static void Write(string m)
    {
        if (FilePath == null) return;
        try { File.AppendAllText(FilePath, DateTime.Now.ToString("HH:mm:ss.fff") + " " + m + Environment.NewLine); } catch { }
    }
}

static class Native
{
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    public const int GWL_STYLE = -16, GWL_EXSTYLE = -20, GWLP_HWNDPARENT = -8;
    public const int WS_CAPTION = 0x00C00000, WS_SYSMENU = 0x00080000, WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    public const int WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000;
    public const uint GW_OWNER = 4, GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GA_ROOTOWNER = 3;
    public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
    public const int WS_EX_TOPMOST = 0x8;
    public static readonly IntPtr HWND_TOP = IntPtr.Zero, HWND_TOPMOST = new IntPtr(-1);
    public const uint WM_SYSCOMMAND = 0x112;
    public const int SC_MINIMIZE = 0xF020, SC_MAXIMIZE = 0xF030, SC_CLOSE = 0xF060, SC_RESTORE = 0xF120;
    public const int DWMWA_CLOAKED = 14, DWMWA_BORDER_COLOR = 34, DWMWA_CAPTION_COLOR = 35, DWMWA_TEXT_COLOR = 36,
                     DWMWA_CORNER_PREFERENCE = 33, DWMWA_CAPTION_BUTTON_BOUNDS = 5, DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    public const int DWMWA_COLOR_DEFAULT = unchecked((int)0xFFFFFFFF);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X, Y; public POINT(int x, int y) { X = x; Y = y; } }
    public const uint GA_ROOT = 2;
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);

    public static Color PixelAt(int x, int y)
    {
        IntPtr dc = GetDC(IntPtr.Zero);
        try
        {
            uint c = GetPixel(dc, x, y);
            if (c == 0xFFFFFFFF) return Color.Empty;
            return Color.FromArgb(255, (int)(c & 0xFF), (int)((c >> 8) & 0xFF), (int)((c >> 16) & 0xFF));
        }
        finally { ReleaseDC(IntPtr.Zero, dc); }
    }

    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr mon, int type, out uint dpiX, out uint dpiY);

    // True when the window is bitmap-scaled by Windows (DPI-unaware on a scaled monitor). DWM reports
    // its caption geometry in a mixed coordinate space, so such windows are left with native buttons.
    public static bool IsDpiVirtualized(IntPtr h)
    {
        uint winDpi = GetDpiForWindow(h);
        uint mx, my;
        IntPtr mon = MonitorFromWindow(h, 2);   // MONITOR_DEFAULTTONEAREST
        if (winDpi == 0 || mon == IntPtr.Zero || GetDpiForMonitor(mon, 0, out mx, out my) != 0) return false;
        return winDpi != mx;
    }
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc p, uint pid, uint tid, uint flags);
    [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);

    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT v, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);

    public static void SetDwm(IntPtr h, int attr, int value)
    {
        DwmSetWindowAttribute(h, attr, ref value, 4);
    }
}

class Theme
{
    public Color Bar, Fg, Hov, Prs, Border;
    public bool Dark;

    public static Theme Current()
    {
        bool light = false;
        try
        {
            object v = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1);
            light = v is int && (int)v == 1;
        }
        catch { }
        Theme t = new Theme();
        t.Dark = !light;
        if (light)
        {
            t.Bar = ColorTranslator.FromHtml("#f2f2f4");
            t.Fg = ColorTranslator.FromHtml("#1d1d1f");
            t.Hov = Color.FromArgb(unchecked((int)0xFF000000) | 0xE3E3E5);   // rgba(0,0,0,.07) over bar
            t.Prs = Color.FromArgb(unchecked((int)0xFF000000) | 0xD2D2D4);   // rgba(0,0,0,.13) over bar
            t.Border = ColorTranslator.FromHtml("#dcdce0");
        }
        else
        {
            t.Bar = ColorTranslator.FromHtml("#232326");
            t.Fg = ColorTranslator.FromHtml("#f5f5f7");
            t.Hov = Color.FromArgb(unchecked((int)0xFF000000) | 0x39393C);   // rgba(255,255,255,.11) over bar
            t.Prs = Color.FromArgb(unchecked((int)0xFF000000) | 0x4B4B4D);   // rgba(255,255,255,.18) over bar
            t.Border = ColorTranslator.FromHtml("#2e2e32");
        }
        return t;
    }

    public bool SameAs(Theme o) { return o != null && o.Bar == Bar; }

    public static int Colorref(Color c) { return c.R | (c.G << 8) | (c.B << 16); }
}

// A borderless, non-activating window owned by the target so it stays directly above it in z-order.
class Overlay : Form
{
    public readonly IntPtr Target;
    Theme theme;
    // Title bar color actually on screen next to the buttons. Some apps (Explorer) paint their own
    // title bar, so the theme color would show as a mismatched block.
    Color bar, fgC, hovC, prsC;
    int sampleTick;
    int hover = -1, down = -1;
    Rectangle lastRect;
    bool lastZoomed, lastActive;
    bool hasMin, hasMax, loggedOnce, loggedShown;
    float dpiScale = 1f;
    Rectangle[] rects = new Rectangle[3];   // 0 min, 1 max, 2 close
    bool[] shown = new bool[3];

    public Overlay(IntPtr target, Theme theme)
    {
        Target = target;
        this.theme = theme;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.Opaque, true);
        int style = Native.GetWindowLong(target, Native.GWL_STYLE);
        hasMin = (style & Native.WS_MINIMIZEBOX) != 0;
        hasMax = (style & Native.WS_MAXIMIZEBOX) != 0;
        UseBar(theme.Bar);
        Size = new Size(1, 1);
        IntPtr unused = Handle;   // force handle creation so the owner can be set before the window is shown
        Native.SetWindowLongPtr(Handle, Native.GWLP_HWNDPARENT, target);
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return cp;
        }
    }

    public void SetTheme(Theme t)
    {
        theme = t;
        UseBar(t.Bar);
        Invalidate();
    }

    static Color Blend(Color baseColor, Color over, double a)
    {
        return Color.FromArgb(255,
            (int)Math.Round(baseColor.R + (over.R - baseColor.R) * a),
            (int)Math.Round(baseColor.G + (over.G - baseColor.G) * a),
            (int)Math.Round(baseColor.B + (over.B - baseColor.B) * a));
    }

    // Sets the bar color and derives text and hover/pressed colors (spec: white .11/.18 on dark, black .07/.13 on light).
    void UseBar(Color c)
    {
        bar = Color.FromArgb(255, c.R, c.G, c.B);
        BackColor = bar;
        bool dark = (0.299 * c.R + 0.587 * c.G + 0.114 * c.B) < 128;
        fgC = ColorTranslator.FromHtml(dark ? "#f5f5f7" : "#1d1d1f");
        hovC = Blend(bar, dark ? Color.White : Color.Black, dark ? .11 : .07);
        prsC = Blend(bar, dark ? Color.White : Color.Black, dark ? .18 : .13);
    }

    // Reads the pixel just left of the buttons, but only when this window is what is visible there.
    void SampleBar(Rectangle r)
    {
        int px = r.X - (int)Math.Round(6 * dpiScale), py = r.Y + (int)Math.Round(2 * dpiScale);
        IntPtr hit = Native.WindowFromPoint(new Native.POINT(px, py));
        if (hit == IntPtr.Zero || Native.GetAncestor(hit, Native.GA_ROOT) != Target) return;
        Color c = Native.PixelAt(px, py);
        if (c.IsEmpty || (c.R == bar.R && c.G == bar.G && c.B == bar.B)) return;
        UseBar(c);
        Invalidate();
    }

    static bool IsCloaked(IntPtr h)
    {
        int cloaked;
        return Native.DwmGetWindowAttribute(h, Native.DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0;
    }

    // Returns false when the target is gone and this overlay should be discarded.
    public bool Sync()
    {
        if (IsDisposed) return false;
        if (!Native.IsWindow(Target)) return false;
        if (!Native.IsWindowVisible(Target) || Native.IsIconic(Target) || IsCloaked(Target) || Native.IsDpiVirtualized(Target))
        {
            if (Visible) Hide();
            return true;
        }

        Native.RECT wr, cb;
        int hrb = Native.DwmGetWindowAttribute(Target, Native.DWMWA_CAPTION_BUTTON_BOUNDS, out cb, 16);
        Native.GetWindowRect(Target, out wr);
        if (!loggedOnce) { loggedOnce = true; Log.Write("sync " + Target + " hr=0x" + hrb.ToString("X") + " wr=" + wr.Left + "," + wr.Top + "," + wr.Right + "," + wr.Bottom + " cb=" + cb.Left + "," + cb.Top + "," + cb.Right + "," + cb.Bottom); }
        if (hrb != 0)
        {
            if (Visible) Hide();
            return true;
        }

        // X is relative to the window rect, but Y is relative to the visible frame: a maximized window's
        // rect starts 8px above the screen while its caption starts at the screen edge.
        Native.RECT ef;
        int frameTop = Native.DwmGetWindowAttribute(Target, Native.DWMWA_EXTENDED_FRAME_BOUNDS, out ef, 16) == 0 ? ef.Top : wr.Top;
        Rectangle r = new Rectangle(wr.Left + cb.Left, frameTop + cb.Top, cb.Right - cb.Left, cb.Bottom - cb.Top);
        if (r.Width <= 0 || r.Height <= 0)
        {
            if (Visible) Hide();
            return true;
        }

        bool zoomed = Native.IsZoomed(Target);
        bool active = Native.GetAncestor(Native.GetForegroundWindow(), Native.GA_ROOTOWNER) == Target;
        bool changed = r != lastRect || zoomed != lastZoomed;

        if (changed)
        {
            uint dpi = Native.GetDpiForWindow(Target);
            dpiScale = dpi == 0 ? 1f : dpi / 96f;
            Native.SetWindowPos(Handle, IntPtr.Zero, r.X, r.Y, r.Width, r.Height, Native.SWP_NOZORDER | Native.SWP_NOACTIVATE);
            LayoutButtons();
            ApplyRegion(zoomed);
        }
        if (!Visible) Show();
        EnsureAboveTarget();
        if (changed || ++sampleTick % 10 == 0) SampleBar(r);
        if (!loggedShown) { loggedShown = true; Log.Write("shown " + Target + " visible=" + Visible + " bounds=" + Bounds + " owner=" + Native.GetWindow(Handle, Native.GW_OWNER) + " expected=" + Target + " overlayHwnd=" + Handle + " nextIsTarget=" + (Native.GetWindow(Handle, Native.GW_HWNDNEXT) == Target)); }
        if (changed || active != lastActive) Invalidate();

        lastRect = r; lastZoomed = zoomed; lastActive = active;
        return true;
    }

    // Keeps this overlay directly above its target in z-order. Ownership alone is not enough
    // for cross-process owners or topmost targets.
    void EnsureAboveTarget()
    {
        if (Native.GetWindow(Handle, Native.GW_HWNDNEXT) == Target) return;
        bool topmost = (Native.GetWindowLong(Target, Native.GWL_EXSTYLE) & Native.WS_EX_TOPMOST) != 0;
        IntPtr prev = Native.GetWindow(Target, Native.GW_HWNDPREV);
        IntPtr after = prev != IntPtr.Zero ? prev : (topmost ? Native.HWND_TOPMOST : Native.HWND_TOP);
        if (after == Handle) return;
        Native.SetWindowPos(Handle, after, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
    }

    void LayoutButtons()
    {
        int h = ClientSize.Height, w = ClientSize.Width;
        int btn = Math.Max(16, (int)Math.Round(h - 4 * dpiScale));
        int gap = (int)Math.Round(2 * dpiScale);
        int pad = (int)Math.Round(4 * dpiScale);
        int y = (h - btn) / 2;
        int x = w - pad - btn;
        shown[2] = true; rects[2] = new Rectangle(x, y, btn, btn);
        bool three = hasMin || hasMax;
        shown[1] = shown[0] = three;
        if (three)
        {
            x -= btn + gap; rects[1] = new Rectangle(x, y, btn, btn);
            x -= btn + gap; rects[0] = new Rectangle(x, y, btn, btn);
        }
    }

    void ApplyRegion(bool zoomed)
    {
        if (zoomed) { Region = null; return; }
        int rad = (int)Math.Round(8 * dpiScale), w = Width, h = Height;
        using (GraphicsPath p = new GraphicsPath())
        {
            p.AddLine(0, 0, w - rad, 0);
            p.AddArc(w - 2 * rad, 0, 2 * rad, 2 * rad, 270, 90);
            p.AddLine(w, rad, w, h);
            p.AddLine(w, h, 0, h);
            p.CloseFigure();
            Region = new Region(p);
        }
    }

    int HitTest(Point p)
    {
        for (int i = 0; i < 3; i++) if (shown[i] && rects[i].Contains(p)) return i;
        return -1;
    }

    bool Enabled2(int i)
    {
        if (i == 0) return hasMin;
        if (i == 1) return hasMax;
        return true;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        int i = HitTest(e.Location);
        if (i != hover) { hover = i; Invalidate(); }
        base.OnMouseMove(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        if (hover != -1) { hover = -1; Invalidate(); }
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left) { down = HitTest(e.Location); Invalidate(); }
        base.OnMouseDown(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        int i = HitTest(e.Location);
        int was = down;
        down = -1;
        Invalidate();
        if (e.Button == MouseButtons.Left && i >= 0 && i == was && Enabled2(i))
        {
            int cmd = i == 0 ? Native.SC_MINIMIZE : (i == 1 ? (Native.IsZoomed(Target) ? Native.SC_RESTORE : Native.SC_MAXIMIZE) : Native.SC_CLOSE);
            Native.PostMessage(Target, Native.WM_SYSCOMMAND, (IntPtr)cmd, IntPtr.Zero);
        }
        base.OnMouseUp(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.Clear(bar);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        for (int i = 0; i < 3; i++)
        {
            if (!shown[i]) continue;
            Rectangle r = rects[i];
            bool enabled = Enabled2(i);
            bool isClose = i == 2;
            Color fg = fgC;
            Color fill = Color.Empty;
            if (enabled && down == i) { fill = isClose ? ColorTranslator.FromHtml("#B42318") : prsC; }
            else if (enabled && hover == i && down == -1) { fill = isClose ? ColorTranslator.FromHtml("#D92D20") : hovC; }
            if (isClose && !fill.IsEmpty) fg = Color.White;

            float radius = 10f * r.Width / 36f;
            if (!fill.IsEmpty)
            {
                using (GraphicsPath p = RoundRect(r.X, r.Y, r.Width, r.Height, radius))
                using (SolidBrush b = new SolidBrush(fill))
                    g.FillPath(b, p);
            }

            if (Log.FilePath != null)   // --debug: outline the buttons so they can be told apart from the native ones
                using (GraphicsPath dp = RoundRect(r.X, r.Y, r.Width, r.Height, radius))
                using (Pen dpen = new Pen(Color.DeepSkyBlue, 1f))
                    g.DrawPath(dpen, dp);

            int alpha = !enabled ? 90 : (lastActive || hover == i ? 255 : 160);
            DrawIcon(g, i, r, Color.FromArgb(alpha, fg));
        }
    }

    static GraphicsPath RoundRect(float x, float y, float w, float h, float r)
    {
        GraphicsPath p = new GraphicsPath();
        float d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    // Icons use the 16x16 grid from the spec, 2px round stroke.
    void DrawIcon(Graphics g, int index, Rectangle btn, Color color)
    {
        float size = btn.Width * 16f / 36f;
        GraphicsState saved = g.Save();
        g.TranslateTransform(btn.X + (btn.Width - size) / 2f, btn.Y + (btn.Height - size) / 2f);
        g.ScaleTransform(size / 16f, size / 16f);
        using (Pen pen = new Pen(color, 2.2f))
        {
            pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; pen.LineJoin = LineJoin.Round;
            if (index == 0)
            {
                g.DrawLine(pen, 3, 8, 13, 8);
            }
            else if (index == 1)
            {
                if (Native.IsZoomed(Target))
                {
                    using (GraphicsPath a = new GraphicsPath())
                    {
                        a.AddLine(6, 3, 11.5f, 3);
                        a.AddArc(10f, 3f, 3f, 3f, 270, 90);
                        a.AddLine(13, 4.5f, 13, 10);
                        g.DrawPath(pen, a);
                    }
                    using (GraphicsPath b = RoundRect(2.5f, 5.5f, 8, 8, 2.5f)) g.DrawPath(pen, b);
                }
                else
                {
                    using (GraphicsPath b = RoundRect(3, 3, 10, 10, 2.5f)) g.DrawPath(pen, b);
                }
            }
            else
            {
                g.DrawLine(pen, 4, 4, 12, 12);
                g.DrawLine(pen, 12, 4, 4, 12);
            }
        }
        g.Restore(saved);
    }
}

class StylerContext : ApplicationContext
{
    static readonly string[] DefaultExcluded = {
        // These draw their own title bar; covering their buttons would look wrong.
        "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc",
        "code", "cursor", "discord", "slack", "spotify", "teams", "ms-teams", "claude", "notion", "signal", "whatsapp",
        "steam", "steamwebhelper", "epicgameslauncher", "battle.net",
        "applicationframehost", "textinputhost", "searchhost", "startmenuexperiencehost", "shellexperiencehost"
    };
    static readonly string[] SkipClasses = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow" };

    readonly Dictionary<IntPtr, Overlay> overlays = new Dictionary<IntPtr, Overlay>();
    readonly HashSet<IntPtr> styled = new HashSet<IntPtr>();
    readonly Dictionary<uint, string> procNames = new Dictionary<uint, string>();
    readonly HashSet<string> excluded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    readonly uint ownPid = (uint)Process.GetCurrentProcess().Id;
    readonly string excludePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "exclude.txt");
    readonly NotifyIcon tray;
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly Native.WinEventProc hookProc;
    IntPtr hook;
    Theme theme = Theme.Current();
    bool enabled = true;
    int tickCount;

    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string RunName = "TitleBarStyler";

    public StylerContext()
    {
        LoadExcluded();

        ToolStripMenuItem enabledItem = new ToolStripMenuItem("Enabled") { Checked = true, CheckOnClick = true };
        enabledItem.CheckedChanged += delegate { SetEnabled(enabledItem.Checked); };
        ToolStripMenuItem startupItem = new ToolStripMenuItem("Start with Windows") { Checked = IsStartup(), CheckOnClick = true };
        startupItem.CheckedChanged += delegate { SetStartup(startupItem.Checked); };
        ToolStripMenuItem excludeItem = new ToolStripMenuItem("Edit excluded apps...");
        excludeItem.Click += delegate
        {
            if (!File.Exists(excludePath))
                File.WriteAllText(excludePath, "# One process name per line (without .exe). Restart TitleBarStyler after editing.\r\n");
            Process.Start("notepad.exe", "\"" + excludePath + "\"");
        };
        ToolStripMenuItem exitItem = new ToolStripMenuItem("Exit");
        exitItem.Click += delegate { Shutdown(); };

        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[] { enabledItem, startupItem, excludeItem, new ToolStripSeparator(), exitItem });

        tray = new NotifyIcon();
        tray.Icon = MakeTrayIcon();
        tray.Text = "Title Bar Styler";
        tray.ContextMenuStrip = menu;
        tray.Visible = true;

        hookProc = OnWinEvent;
        hook = Native.SetWinEventHook(0x800B, 0x800B, IntPtr.Zero, hookProc, 0, 0, 0);   // EVENT_OBJECT_LOCATIONCHANGE

        timer.Interval = 100;
        timer.Tick += delegate { Tick(); };
        timer.Start();
        Tick();
    }

    static Icon MakeTrayIcon()
    {
        using (Bitmap bmp = new Bitmap(32, 32))
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using (SolidBrush b = new SolidBrush(ColorTranslator.FromHtml("#409CFF")))
            using (GraphicsPath p = new GraphicsPath())
            {
                p.AddArc(2, 2, 12, 12, 180, 90); p.AddArc(18, 2, 12, 12, 270, 90);
                p.AddArc(18, 18, 12, 12, 0, 90); p.AddArc(2, 18, 12, 12, 90, 90); p.CloseFigure();
                g.FillPath(b, p);
            }
            using (Pen pen = new Pen(Color.White, 3f))
            {
                pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round;
                g.DrawLine(pen, 9, 12, 23, 12);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }

    void LoadExcluded()
    {
        foreach (string s in DefaultExcluded) excluded.Add(s);
        try
        {
            if (File.Exists(excludePath))
                foreach (string line in File.ReadAllLines(excludePath))
                {
                    string t = line.Trim();
                    if (t.Length > 0 && !t.StartsWith("#")) excluded.Add(t.Replace(".exe", ""));
                }
        }
        catch { }
    }

    static bool IsStartup()
    {
        try { using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey)) return k != null && k.GetValue(RunName) != null; }
        catch { return false; }
    }

    static void SetStartup(bool on)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, true))
            {
                if (on) k.SetValue(RunName, "\"" + Application.ExecutablePath + "\"");
                else k.DeleteValue(RunName, false);
            }
        }
        catch { }
    }

    string ProcessName(IntPtr h)
    {
        uint pid;
        Native.GetWindowThreadProcessId(h, out pid);
        if (pid == ownPid) return null;
        string name;
        if (!procNames.TryGetValue(pid, out name))
        {
            try { name = Process.GetProcessById((int)pid).ProcessName; } catch { name = ""; }
            procNames[pid] = name;
        }
        return name;
    }

    bool Eligible(IntPtr h)
    {
        int style = Native.GetWindowLong(h, Native.GWL_STYLE);
        if ((style & Native.WS_CAPTION) != Native.WS_CAPTION || (style & Native.WS_SYSMENU) == 0) return false;
        if ((Native.GetWindowLong(h, Native.GWL_EXSTYLE) & Native.WS_EX_TOOLWINDOW) != 0) return false;
        if (Native.GetWindow(h, Native.GW_OWNER) != IntPtr.Zero) return false;
        string name = ProcessName(h);
        if (string.IsNullOrEmpty(name) || excluded.Contains(name)) return false;
        StringBuilder sb = new StringBuilder(128);
        Native.GetClassName(h, sb, sb.Capacity);
        string cls = sb.ToString();
        foreach (string s in SkipClasses) if (cls == s) return false;
        return true;
    }

    static bool Presentable(IntPtr h)
    {
        int cloaked;
        return Native.IsWindowVisible(h) && !Native.IsIconic(h) &&
               !(Native.DwmGetWindowAttribute(h, Native.DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0);
    }

    void StyleWindow(IntPtr h)
    {
        Native.SetDwm(h, Native.DWMWA_CAPTION_COLOR, Theme.Colorref(theme.Bar));
        Native.SetDwm(h, Native.DWMWA_TEXT_COLOR, Theme.Colorref(theme.Fg));
        Native.SetDwm(h, Native.DWMWA_BORDER_COLOR, Theme.Colorref(theme.Border));
        Native.SetDwm(h, Native.DWMWA_CORNER_PREFERENCE, 2);   // DWMWCP_ROUND
        styled.Add(h);
    }

    void UnstyleWindow(IntPtr h)
    {
        if (!Native.IsWindow(h)) return;
        Native.SetDwm(h, Native.DWMWA_CAPTION_COLOR, Native.DWMWA_COLOR_DEFAULT);
        Native.SetDwm(h, Native.DWMWA_TEXT_COLOR, Native.DWMWA_COLOR_DEFAULT);
        Native.SetDwm(h, Native.DWMWA_BORDER_COLOR, Native.DWMWA_COLOR_DEFAULT);
        Native.SetDwm(h, Native.DWMWA_CORNER_PREFERENCE, 0);
    }

    void Tick()
    {
        if (!enabled) return;
        tickCount++;

        if (tickCount % 20 == 0)
        {
            Theme t = Theme.Current();
            if (!t.SameAs(theme))
            {
                theme = t;
                foreach (IntPtr h in new List<IntPtr>(styled)) if (Native.IsWindow(h)) StyleWindow(h);
                foreach (Overlay o in overlays.Values) o.SetTheme(theme);
            }
        }

        Native.EnumWindows(delegate(IntPtr h, IntPtr l)
        {
            if (overlays.ContainsKey(h) || !Presentable(h) || !Eligible(h)) return true;
            StyleWindow(h);
            try { overlays[h] = new Overlay(h, theme); Log.Write("overlay created for " + h + " proc=" + ProcessName(h)); }
            catch (Exception ex) { Log.Write("create failed: " + ex); }
            return true;
        }, IntPtr.Zero);

        List<IntPtr> dead = new List<IntPtr>();
        foreach (KeyValuePair<IntPtr, Overlay> kv in overlays)
        {
            bool alive;
            try { alive = kv.Value.Sync() && Eligible(kv.Key); } catch (Exception ex) { alive = false; Log.Write("Sync failed: " + ex); }
            if (!alive) dead.Add(kv.Key);
        }
        foreach (IntPtr h in dead)
        {
            try { overlays[h].Dispose(); } catch { }
            overlays.Remove(h);
            styled.Remove(h);
        }
        if (tickCount % 50 == 0) procNames.Clear();   // PIDs get reused
    }

    void OnWinEvent(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (idObject != 0 || !enabled) return;   // OBJID_WINDOW only
        Overlay o;
        if (overlays.TryGetValue(hwnd, out o))
        {
            try { o.Sync(); } catch { }
        }
    }

    void ClearAll()
    {
        foreach (Overlay o in overlays.Values) { try { o.Dispose(); } catch { } }
        overlays.Clear();
        foreach (IntPtr h in styled) UnstyleWindow(h);
        styled.Clear();
    }

    void SetEnabled(bool on)
    {
        enabled = on;
        if (!on) ClearAll();
        else Tick();
    }

    void Shutdown()
    {
        timer.Stop();
        if (hook != IntPtr.Zero) Native.UnhookWinEvent(hook);
        ClearAll();
        tray.Visible = false;
        tray.Dispose();
        ExitThread();
    }
}

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        if (Array.IndexOf(args, "--debug") >= 0)
            Log.FilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "debug.log");
        bool created;
        using (Mutex m = new Mutex(true, "TitleBarStyler.SingleInstance", out created))
        {
            if (!created) return;
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Log.Write("ThreadException: " + e.Exception); };
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) { Log.Write("Unhandled: " + e.ExceptionObject); };
            Application.EnableVisualStyles();
            Application.Run(new StylerContext());
        }
    }
}
