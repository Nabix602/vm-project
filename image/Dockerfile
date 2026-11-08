# Linux Alpine 32 bits (le format que v86 sait émuler), avec les outils courants.
FROM docker.io/i386/alpine:3.21.0

ENV KERNEL=virt

RUN apk add --no-cache \
    openrc alpine-base agetty alpine-conf linux-$KERNEL linux-firmware-none \
    kbd-bkeymaps nano less git python3 py3-pip nodejs npm \
    curl wget ca-certificates openssh-client make gcc musl-dev

# Connexion automatique (console écran + console série), sans mot de passe
RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab
RUN echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab
RUN echo "root:" | chpasswd

RUN setup-hostname localhost

# Clavier français (la page envoie les touches physiques, c'est Linux qui traduit)
RUN setup-keymap fr fr

# Réseau : si la page branche une carte réseau, on demande une adresse (DHCP) au démarrage
RUN mkdir -p /etc/local.d && printf '%s\n' \
    '#!/bin/sh' \
    'modprobe virtio_net 2>/dev/null' \
    'for i in 1 2 3 4 5; do [ -d /sys/class/net/eth0 ] && break; sleep 1; done' \
    'if [ -d /sys/class/net/eth0 ]; then' \
    '  ip link set eth0 up' \
    '  udhcpc -i eth0 -n -q -t 10 >/dev/null 2>&1 &' \
    'fi' > /etc/local.d/10-network.start \
    && chmod +x /etc/local.d/10-network.start \
    && rc-update add local default

RUN printf 'VM Project - Alpine Linux dans ton navigateur\n\n' > /etc/motd

# https://wiki.alpinelinux.org/wiki/Alpine_Linux_in_a_chroot#Preparing_init_services
RUN for i in devfs dmesg mdev hwdrivers; do rc-update add $i sysinit; done
RUN for i in hwclock modules sysctl hostname syslog bootmisc; do rc-update add $i boot; done
RUN rc-update add killprocs shutdown

# Initramfs avec les modules 9p (le disque est un système de fichiers 9p servi par la page)
RUN mkinitfs -F "base virtio 9p" $(cat /usr/share/kernel/$KERNEL/kernel.release)
