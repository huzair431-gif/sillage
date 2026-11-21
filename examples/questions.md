## Que représente le speedup d’un programme parallèle ?

ID: pc40-speedup-001
Notion: Accélération
Difficulté: Facile

- [ ] Le nombre de processeurs disponibles
- [x] Le rapport entre le temps séquentiel et le temps parallèle
- [ ] La quantité de mémoire utilisée

> Le speedup se définit par $S = T_{seq} / T_{par}$ pour une même tâche.
> Il compare le temps de référence séquentiel au temps d’exécution parallèle.

## Quels coûts peuvent réduire l’accélération parallèle ?

ID: pc40-couts-002
Notion: Surcoûts
Difficulté: Moyen

- [x] Les communications entre processeurs
- [x] Les synchronisations entre tâches
- [ ] Le nom des variables du programme

> Les communications et les synchronisations consomment du temps.
> Elles peuvent réduire le gain obtenu en distribuant le calcul.

## La partie séquentielle limite l’accélération décrite par la loi d’Amdahl.

ID: pc40-amdahl-003
Type: vrai_faux
Notion: Loi d’Amdahl

- [x] Vrai
- [ ] Faux

> Pour une fraction séquentielle $s > 0$ et $p$ processeurs, le modèle idéal donne
> $S(p) = 1 / (s + (1-s)/p)$. Quand $p$ augmente, la limite vaut $1/s$.

## Quelle chaîne ce code Python affiche-t-il ?

```python
print("## Un titre dans du code")
```

ID: code-markdown-004
Notion: Lecture de code
Difficulté: Facile

- [x] `## Un titre dans du code`
- [ ] `Un titre dans du code` sans les dièses

> Les dièses se trouvent dans une chaîne de caractères.
> Ils sont affichés tels quels et ne délimitent pas une autre question dans ce fichier.
