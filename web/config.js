// Réglages de la machine. Modifie ici, pas dans app.js.
window.VM_CONFIG = {
  // Mémoire vive de la machine, en Mo.
  memoryMB: 512,

  // Système de fichiers Linux (construit par GitHub Actions, voir image/Dockerfile).
  fsJson: "images/alpine-fs.json",
  fsBase: "images/alpine-rootfs-flat/",
  // Valeurs par défaut (modifiables sur l'écran de démarrage) :
  // bureau graphique ou console texte, et largeur de l'écran en pixels (la hauteur suit ton écran)
  desktop: true,
  screenWidth: 1024,

  cmdline: "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable mitigations=off",

  // Accès Internet : adresse d'un relais réseau public (sans compte).
  // Mettre "" pour démarrer sans réseau.
  networkRelay: "wss://relay.widgetry.org/"
};
