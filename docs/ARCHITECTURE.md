# Architecture et décisions métier

`apps/web` présente les données via TanStack Query, React Router, RHF et Zod. `packages/quiz-parser` utilise l’AST remark/GFM ; les titres dans des blocs de code sont ignorés. L’analyse progressive tourne dans un Web Worker. `packages/shared` définit les schémas d’entrée stricts et les contrats de réponse. Le monolithe Nest est séparé en modules auth, bibliothèque/statistiques, imports/questions, quiz et sauvegardes. Prisma emploie le pilote PostgreSQL natif `@prisma/adapter-pg`.

Les versions installées sont verrouillées. Node 24 LTS et PostgreSQL 16 sont les cibles de la livraison. Prisma 7 est conservé comme version stable plutôt que la préversion Prisma 8. Les adaptations de dépendances `effect` et `katex` dans le manifeste corrigent des avis de sécurité sans mise à jour majeure des frameworks.

## Invariants

- Toute recherche de ressource vérifie son propriétaire côté serveur. Les erreurs ne révèlent pas l’existence de la ressource d’un autre utilisateur.
- Les suppressions de matières, chapitres et questions sont logiques. Les tentatives et snapshots sont conservés. Une restauration confirmée est, elle, un remplacement physique et transactionnel de l’espace du seul compte concerné.
- Une question a des options normalisées pour l’édition courante et des snapshots pédagogiques immuables dans `QuestionVersion`. Les sessions référencent les snapshots, avec leur ordre d’options figé.
- Le hash pédagogique inclut l’énoncé, le type, les choix et leur justesse, l’explication, la difficulté et la notion. Une modification de ces données crée une version. Le changement du seul identifiant externe ne change pas la mémoire. Aucune détection approximative de « petite faute » n’est tentée.
- Les imports verrouillent le chapitre et vérifient sa révision. Les réponses verrouillent la session ; les mises à jour de mémoire verrouillent la question pour sérialiser deux sessions concurrentes.
- Une tentative unique par question de session, et une clé d’idempotence unique par session, empêchent la double écriture. Réutiliser une clé avec un autre contenu est refusé.
- Une réponse à une ancienne version est conservée dans l’historique sans modifier la mémoire de la version actuelle.

## Révision

Le serveur sélectionne un lot sans doublons avec une graine enregistrée. Les proportions dues/fragiles/nouvelles/maîtrisées sont indicatives (50/25/20/5), redistribuées si une catégorie manque. Les questions en retard sont prioritaires, ainsi que les erreurs récentes et les notions fragiles. Les notions sont mélangées dans le lot sélectionné.

Une erreur en Découverte ou Révision ajoute au plus un renforcement en fin de file. Il est séparé de la première tentative, ne compte pas dans le score et ne modifie pas la preuve de mémorisation. Pour les lots courts et les erreurs en fin de séance, cette répétition est proposée en fin de séance même si trois questions ne peuvent pas la séparer de l’erreur. La correction doit être confirmée côté serveur avant la réponse suivante.

La mémoire utilise des colonnes PostgreSQL `DATE` pour les échéances. Le jour courant est déterminé par `Intl.DateTimeFormat` dans le fuseau configuré ; les additions sont faites sur la date, sans additionner artificiellement 24 heures locales. Les échéances dépassées restent dues.

Une première réussite fiable conduit à J+1, la suivante à J+3, puis J+7, J+14, J+30, J+60, J+90 et J+120. À partir de trois succès fiables, l’état devient `MASTERED`. Les répétitions le même jour et les révisions avant l’échéance n’augmentent pas la série. Une erreur ou une réponse devinée réinitialise la série et programme J+1. Les compteurs historiques de réussites et d’erreurs sont séparés de cette série ; toutes les tentatives détaillées sont conservées.

## Examen, interruptions et résultats

La justesse est calculée lors de la réception, mais n’est exposée et appliquée à la mémoire qu’à la clôture de l’examen. Les choix, énoncés et métadonnées visibles n’incluent ni correction, ni hash, ni explication. Un examen chronométré conserve une échéance serveur, qui continue pendant une déconnexion. À la reprise après l’échéance, il est clôturé. Les questions d’examen laissées sans réponse sont incorrectes ; une session d’entraînement terminée tôt ne note que les premières réponses effectivement évaluées.

Un échec réseau garde le même identifiant d’idempotence dans l’onglet. L’interface annonce explicitement l’attente de confirmation. Aucune synchronisation hors ligne complète n’est promise. Les sessions et les réponses confirmées se retrouvent sur un autre appareil après connexion.

## Limites d’exploitation

Le limiteur de tentatives est en mémoire du processus Nest et borné. Exploiter une seule instance API, ou ajouter un contrôle de débit partagé au reverse proxy avant d’augmenter le nombre de réplicas. Les historiques de questions affichent les 100 dernières tentatives, les listes de questions et sessions sont paginées. Les données supprimées restent dans les exports ; aucune corbeille de restauration individuelle n’est actuellement proposée. Les illustrations et statistiques de l’interface ne contiennent aucun jeu de données simulé.

Les réponses d’examen conservent leur date réelle d’enregistrement. Les questions non répondues prennent la date de clôture effective ou de l’échéance expirée. Une clôture tardive ne transforme donc pas une ancienne réponse en un rappel récent ; si une révision plus récente existe déjà, les compteurs historiques sont enrichis sans remplacer sa preuve de mémorisation.
