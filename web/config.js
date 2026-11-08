// Réglages de la machine. Modifie ici, pas dans app.js.
window.VM_CONFIG = {
  // Mémoire vive de la machine, en Mo.
  memoryMB: 256,

  // Système de fichiers Linux (construit par GitHub Actions, voir image/Dockerfile).
  fsJson: "images/alpine-fs.json",
  fsBase: "images/alpine-rootfs-flat/",
  cmdline: "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable init_on_free=on",

  // Accès Internet : adresse d'un relais réseau public (sans compte).
  // Mettre "" pour démarrer sans réseau.
  networkRelay: "wss://relay.widgetry.org/"
};
