# Sauvegardes et reprise

## Export du compte

Les paramètres permettent de télécharger le format `sillage`, version `1`. Il contient les préférences, matières et chapitres actifs ou archivés, questions/options, versions immuables, sessions et ordres des options, tentatives, mémoires et journaux d’importation. Les images des questions et de leurs anciennes versions sont incluses dans l’export. Les hashes de mots de passe, cookies, sessions d’authentification et jetons de restauration sont exclus.

Le formulaire de restauration accepte un fichier de 30 Mo au maximum. Pour un historique plus volumineux, utiliser la procédure de restauration PostgreSQL ci-dessous.

La restauration vérifie le schéma, les références, les versions, les choix et la justesse des tentatives. Une validation donne un jeton lié au compte et au hash du fichier, valable quinze minutes et utilisable une seule fois. La confirmation exacte `REMPLACER MES DONNÉES` est requise. Toute l’écriture est transactionnelle ; les identifiants sont réattribués pour éviter les collisions et références vers les données d’un autre compte. Le compte et le mot de passe ne sont jamais remplacés.

Avant une restauration, télécharger un export de l’état courant. La restauration remplace les données du compte, y compris ses archives. Fermer les autres onglets de quiz avant l’opération.

## Sauvegarde PostgreSQL

Politique recommandée à configurer réellement : sauvegarde quotidienne chiffrée, 7 quotidiennes, 4 hebdomadaires et 12 mensuelles, stockage dans un compte ou espace distinct de la base principale. Pour un besoin de perte de données inférieur à 24 heures, activer aussi la restauration à un instant donné du fournisseur. Restreindre l’accès aux sauvegardes : elles contiennent des données personnelles et les hashes d’authentification.

`scripts/backup.sh` crée un dump PostgreSQL au format custom et vérifie son catalogue. Les outils `pg_dump`/`pg_restore` doivent avoir une version compatible avec le serveur. Définir `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` et utiliser un `PGPASSFILE` privé (permissions 600). Le mot de passe n’apparaît pas dans les arguments du processus.

```bash
SILLAGE_BACKUP_DIR=/chemin/stockage-separe bash scripts/backup.sh
```

Cette commande réalise une sauvegarde ponctuelle. Elle n’installe pas de cron et ne vérifie pas à elle seule qu’une restauration complète est possible. Configurer séparément la planification, le chiffrement, la copie distante, la rétention et une alerte en cas d’échec.

## Vérification mensuelle de restauration

1. Créer une base isolée vide, distincte de la production, par exemple `sillage_restore_test`.
2. Restaurer un dump récent avec `pg_restore --exit-on-error --no-owner --no-acl --dbname=sillage_restore_test fichier.dump`, les paramètres de connexion venant des variables `PG*`.
3. Pointer temporairement une instance isolée de Sillage vers cette base, avec une origine et des cookies séparés.
4. Vérifier la connexion, les nombres de matières et questions, les dernières tentatives, une ancienne correction et le démarrage d’une nouvelle révision.
5. Consigner la date du dump, sa taille, le résultat, la durée de restauration et l’écart attendu de données. Supprimer ensuite l’instance et la base de contrôle selon la procédure d’exploitation.

En cas de reprise de production, arrêter les écritures, préserver une copie de la base endommagée, restaurer vers une nouvelle base, valider puis basculer `DATABASE_URL`. Ne pas écraser directement la seule copie existante.

Les tests applicatifs de livraison vérifient l’export/restauration utilisateur sur PostgreSQL. Ils ne constituent pas une sauvegarde serveur distante et aucune sauvegarde automatique n’est annoncée comme active.
