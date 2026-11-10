#!/bin/sh
export LANG=C.UTF-8
xsetroot -solid '#16314f'
xrdb -merge /root/.Xresources
exec dbus-launch --exit-with-session sh -c 'tint2 & exec openbox-session'
