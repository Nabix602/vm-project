export LANG=C.UTF-8
export PAGER=less

# Sur l'écran principal (tty1), lance le bureau si la page l'a demandé (desktop=1)
if [ "$(tty)" = "/dev/tty1" ] && [ -z "$DISPLAY" ] && grep -qw desktop=1 /proc/cmdline; then
    startx -- -nolisten tcp >/tmp/startx.log 2>&1
fi
