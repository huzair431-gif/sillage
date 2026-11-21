# Vérifications de livraison

La réalisation utilise Node.js 24.22.3 et PostgreSQL 16.15. Les contrôles ci-dessous ont été exécutés localement, sur des données de test stockées dans PostgreSQL. Aucun tableau de statistiques fictif n’est injecté dans l’application.

| Contrôle | Résultat |
| --- | --- |
| Installation propre avec `npm ci`, depuis le verrouillage fourni | Réussie |
| TypeScript strict, frontend et backend | Réussi |
| Construction de production React/Vite et Nest | Réussie |
| Vitest : parseur, calendrier, sélection, statistiques, composants et focus | 25 tests réussis |
| Intégration HTTP et PostgreSQL : deux comptes isolés | 10 tests réussis |
| Playwright : parcours complet et responsive/accessibilité | 2 scénarios réussis |
| Audit des dépendances npm | 0 vulnérabilité signalée au contrôle |
| Dump PostgreSQL au format custom et restauration dans une base isolée | Réussis ; nombres de matières, questions et tentatives identiques |
| Syntaxe du script de sauvegarde et du lanceur local | Vérifiée |

Le parcours navigateur couvre la connexion, la création de matière et chapitre, le collage de 40 questions, la correction visuelle, l’importation, une séance de 20 questions avec erreur et renforcement, le bilan, la reconnexion et la persistance, la priorité des fragilités, un examen sans correction intermédiaire, le remplacement versionné, l’export et la restauration.

Une coupure réseau est simulée pendant une réponse, suivie d’un rechargement de la page et d’une nouvelle tentative d’enregistrement. Les essais API vérifient séparément qu’un rejeu avec la même clé n’écrit pas une seconde tentative. Ils vérifient également les dates d’un examen clôturé en retard et les agrégations quotidiennes dans les fuseaux Europe/Paris et America/New_York.

Les cinq largeurs 360, 390, 768, 1024 et 1440 px sont contrôlées. Les essais mobiles incluent le tableau de bord, les paramètres, l’import et le quiz. Les thèmes clair/sombre, Échap, le retour du focus après les dialogues et l’impossibilité de fermer une correction obligatoire sont vérifiés. Les textes pédagogiques utilisent une taille de lecture d’au moins 16 px.

## Aperçus

Ces captures montrent des comptes jetables de vérification. Les statistiques affichées proviennent de leurs vraies tentatives de test ; ces comptes et ces contenus ne sont pas préchargés dans une nouvelle installation.

- [Interface sur ordinateur](captures/bureau.png)
- [Interface sur mobile](captures/mobile.png)
- [Correction obligatoire après erreur](captures/correction.jpg)

## Limites des contrôles effectués

Docker n’était pas installé dans l’environnement de réalisation : le Dockerfile et Compose sont fournis, mais leur construction/exécution n’a pas été vérifiée ici. PostgreSQL a été exécuté nativement pour les migrations et tests.

Aucun service Railway, Vercel ou Cloudflare ni domaine HTTPS n’a été créé ou déployé. Les fichiers et instructions sont fournis ; un essai de déploiement sur l’infrastructure choisie reste nécessaire. Aucune sauvegarde distante ou tâche planifiée n’est annoncée comme active.

Les tests navigateur ont utilisé Chrome ; les largeurs mobiles ne remplacent pas un contrôle sur chaque appareil physique. L’accessibilité a été travaillée et vérifiée sur les parcours indiqués, sans certification WCAG exhaustive.

La restauration utilisateur dans l’interface est limitée à 30 Mo par fichier. Le dump/restauration PostgreSQL documenté couvre les espaces plus volumineux. Le limiteur de connexion est local au processus : conserver une instance API ou configurer un contrôle partagé au proxy avant une montée en charge.
