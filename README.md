# vm-project

Un ordinateur Linux qui tourne entièrement dans le navigateur, hébergé sur GitHub Pages.
L'émulateur est [v86](https://github.com/copy/v86) : un vrai processeur x86 émulé, qui démarre un vrai noyau Linux.

## Ce que ça fait

- Écran de verrouillage avec un code d'accès (choisi à la première visite, propre au navigateur)
- Démarrage d'un Linux (Buildroot) avec terminal
- Sauvegarde et reprise de la session dans le navigateur (IndexedDB)

## Mise en ligne

1. Sur GitHub : **Settings → Pages → Source : GitHub Actions** (une seule fois).
2. Chaque push sur `main` lance le workflow `.github/workflows/deploy.yml`.
3. Le workflow télécharge v86 et l'image Linux, assemble le site dans `dist/`, puis le publie.

L'adresse sera `https://<ton-pseudo>.github.io/vm-project/`.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `web/` | Les pages du projet (écrans, style, logique) |
| `web/config.js` | Réglages : mémoire, image Linux, relais réseau |
| `scripts/build.sh` | Assemble le site (pages + v86 + image) |
| `.github/workflows/` | Publication automatique sur GitHub Pages |

## Limites actuelles

- Pas d'accès Internet dans la machine (un relais réseau sera ajouté ensuite).
- Le code d'accès est vérifié dans le navigateur : il garde l'entrée, il ne remplace pas une vraie sécurité côté serveur.
- La sauvegarde reste locale à chaque appareil et à chaque navigateur.
