# Polices du profil iPhone / iPad / Mac

Fichiers TTF / OTF **originaux** (non modifiés) intégrés par `npm run build` dans `dist/lisible-polices-<version>.mobileconfig`. Un profil de configuration n'accepte pas le format WOFF2 de l'extension. Sur Mac, on peut aussi installer ces fichiers directement avec le Livre des polices.

Toutes sont sous **SIL Open Font License 1.1** ; les textes de licence sont dans `extension/fonts/licenses/`, et chaque fichier contient aussi sa licence dans ses métadonnées.

| Police | Fichiers | Source |
|---|---|---|
| OpenDyslexic (Abbie Gonzalez) | `OpenDyslexic-{Regular,Bold,Italic,BoldItalic}.otf` | [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic/tree/1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7/compiled), commit `1824da5` (août 2025) |
| Atkinson Hyperlegible (Braille Institute) | `AtkinsonHyperlegible-{Regular,Bold,Italic,BoldItalic}.ttf` | [google/fonts `ofl/atkinsonhyperlegible`](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible) |
| Andika (SIL International) | `Andika-{Regular,Bold,Italic,BoldItalic}.ttf` | [google/fonts `ofl/andika`](https://github.com/google/fonts/tree/main/ofl/andika) |
| Lexend (Bonnie Shaver-Troup, Thomas Jockin) | `Lexend-{Regular,Bold}.ttf` | [googlefonts/lexend `fonts/lexend/ttf`](https://github.com/googlefonts/lexend/tree/7894f02b2e7e/fonts/lexend/ttf), commit `7894f02` |

Pour OpenDyslexic, le dépôt contient deux gras italiques : `OpenDyslexic-BoldItalic.otf` (2025, aligné sur l'italique) est retenu, et non l'ancien `OpenDyslexic-Bold-Italic.otf` (2019).

Pour ajouter ou mettre à jour une police : déposer le fichier TTF / OTF ici, puis relancer `npm run build`. Tous les fichiers `.ttf` et `.otf` du dossier sont intégrés.
