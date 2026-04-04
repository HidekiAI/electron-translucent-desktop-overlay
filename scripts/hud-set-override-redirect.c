/*
 * Sets override_redirect=True on the given X11 window ID (hex, e.g. 0x4600004).
 * With override_redirect set before the window is mapped, the window manager
 * never receives a MapRequest for it and therefore never creates a decoration
 * frame.
 *
 * Build: gcc -O2 -o scripts/hud-set-override-redirect \
 *              scripts/hud-set-override-redirect.c -lX11
 * Usage: hud-set-override-redirect 0x4600004
 */
#include <X11/Xlib.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    if (argc < 2) return 1;
    unsigned long id = strtoul(argv[1], NULL, 0);
    Display *d = XOpenDisplay(NULL);
    if (!d) return 1;
    XSetWindowAttributes a;
    a.override_redirect = True;
    XChangeWindowAttributes(d, (Window)id, CWOverrideRedirect, &a);
    XSync(d, False);
    XCloseDisplay(d);
    return 0;
}
