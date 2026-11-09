#!/bin/sh
export LANG=C.UTF-8
exec dbus-launch --exit-with-session sh -c 'tint2 & pcmanfm --desktop --profile default & exec openbox-session'
