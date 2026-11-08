// Réglages de la machine. Modifie ici, pas dans app.js.
window.VM_CONFIG = {
  // Mémoire vive de la machine, en Mo.
  memoryMB: 64,

  // Image Linux à démarrer (copiée dans images/ au moment de la publication).
  kernel: "images/buildroot-bzimage68.bin",
  cmdline: "tsc=reliable mitigations=off random.trust_cpu=on",

  // Accès Internet : adresse du relais réseau (étape suivante du projet).
  // Laisser vide pour l'instant : la machine démarre sans réseau.
  networkRelay: ""
};
