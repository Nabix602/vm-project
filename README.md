# vm-project

Un vrai Linux (Alpine) qui tourne entièrement dans le navigateur, hébergé sur GitHub Pages.
L'émulateur est [v86](https://github.com/copy/v86) : un processeur x86 émulé qui démarre un vrai noyau Linux.

**Adresse :** https://nabix602.github.io/vm-project/

## Ce que ça fait

- Écran de verrouillage avec un code d'accès (choisi à la première visite, propre au navigateur)
- Linux complet : `git`, `python3`, `node`/`npm`, `gcc`/`make`, `nano`, `curl`, `ssh`
- Clavier français (AZERTY), accents et AltGr compris
- Accès Internet via un relais public (`ping`, `curl`, `git clone`, `npm install`...)
- Sauvegarde et reprise de la session dans le navigateur (fichiers compris)

## Utilisation

- La machine démarre en 1 à 2 minutes la première fois, puis une invite `localhost:~#` apparaît.
- Tu es connecté en `root` (sans mot de passe) : le code d'accès de la page est la seule barrière.
- **Sauvegarder** garde l'état complet de la machine dans ce navigateur. **Éteindre** recharge la page, puis **Reprendre la session sauvegardée** relance la machine telle quelle.
- Pour `git push`, crée un jeton GitHub limité à la repo voulue et utilise-le comme mot de passe.

## Réglages

Tout se règle dans `web/config.js` : mémoire (256 Mo par défaut), relais réseau (`networkRelay`, mettre `""` pour couper Internet).
Le contenu du Linux est décrit dans `image/Dockerfile` (ajoute un paquet à la ligne `apk add`, puis pousse).

## Comment c'est construit

Chaque push sur `main` lance `.github/workflows/deploy.yml` :

1. construit l'image Linux (Docker, mise en cache tant que `image/` ne change pas) ;
2. assemble le site (`scripts/build.sh`) ;
3. **teste le site dans un vrai Chromium** (`tests/e2e.mjs`) : verrouillage, démarrage, outils, clavier, Internet, sauvegarde/reprise ;
4. publie sur Pages seulement si les tests passent ;
5. rejoue les tests sur l'adresse publique.

## Limites

- Plus lent qu'un vrai PC (émulation), mais très utilisable pour du terminal et du code.
- Pas de Windows : trop lourd pour tourner dans un navigateur.
- Le code d'accès est vérifié dans le navigateur : il protège l'entrée de la machine, pas contre quelqu'un qui maîtrise ton navigateur.
- Le relais réseau est public et géré par un tiers : il peut être lent ou tomber en panne, et il voit les sites contactés (pas le contenu HTTPS).
- La sauvegarde reste locale à chaque appareil et à chaque navigateur.
