# Premier quiz CCNA 2 — Modules 1 à 4

20 questions originales en français sur la configuration initiale, la commutation, les VLAN et le routage inter-VLAN. Chaque question comprend ses réponses et une explication. Les exercices sont rédigés pour Sillage ; ils ne reproduisent pas le questionnaire d’ITExamAnswers.

Import : dans un chapitre Sillage, choisir **Ajouter des questions**, puis sélectionner ce fichier Markdown. Les propositions cochées sont les bonnes réponses. Les références Cisco figurent dans les corrections.

## 1. Vous avez modifié la configuration d’un switch IOS. Quelle commande conserve ces changements après un redémarrage ?

ID: ccna2-original-m1-4-001
Type: simple
Notion: Sauvegarde de configuration
Difficulté: Facile

- [ ] `show running-config`
- [x] `copy running-config startup-config`
- [ ] `erase startup-config`
- [ ] `reload`

> La configuration active doit être enregistrée dans la configuration de démarrage. L’afficher avec `show running-config` ne la sauvegarde pas.
> Référence : [Cisco — Configuration initiale](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst1000/software/releases/15_2_7_e/configuration_guides/sys_mgmt/b_1527e_sys_mgmt_c1000_cg/performing_setup_configuration.html).

## 2. Un switch de couche 2 possède l’adresse de gestion 10.71.0.2/24. Quel réglage lui permet de répondre à un administrateur situé dans un autre sous-réseau ?

ID: ccna2-original-m1-4-002
Type: simple
Notion: Passerelle de gestion
Difficulté: Moyen

- [ ] Changer tous les ports en trunks
- [ ] Désactiver les VLAN
- [x] Configurer `ip default-gateway 10.71.0.1`, si ce routeur est joignable sur le VLAN de gestion
- [ ] Utiliser sa propre adresse comme passerelle

> Lorsque le routage IP est désactivé, la passerelle par défaut permet au switch d’envoyer son trafic de gestion vers les réseaux distants.
> Référence : [Cisco — Passerelle par défaut](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst1000/software/releases/15_2_7_e/configuration_guides/sys_mgmt/b_1527e_sys_mgmt_c1000_cg/performing_setup_configuration.html).

## 3. Vous devez administrer un switch en ligne de commande à distance, avec chiffrement. Quel protocole convient ?

ID: ccna2-original-m1-4-003
Type: simple
Notion: Administration SSH
Difficulté: Facile

- [x] SSH version 2
- [ ] Telnet
- [ ] TFTP
- [ ] ARP

> SSH chiffre la session d’administration distante. Telnet transmet les échanges sans cette protection ; TFTP et ARP ne fournissent pas de terminal d’administration.
> Référence : [Cisco — Configuration SSH](https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html).

## 4. Le serveur SSH fonctionne déjà. Quelle commande, appliquée aux lignes VTY concernées, autorise SSH et refuse Telnet ?

ID: ccna2-original-m1-4-004
Type: simple
Notion: Accès VTY
Difficulté: Moyen

- [ ] `transport input all`
- [ ] `transport input telnet`
- [ ] `transport input none`
- [x] `transport input ssh`

> `transport input ssh` limite les connexions entrantes de ces lignes à SSH. Cette commande suppose que le service SSH et l’authentification sont déjà configurés.
> Référence : [Cisco — Restriction des accès SSH](https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html).

## 5. Une trame arrive sur un port Ethernet. Quelles deux informations le switch utilise-t-il pour apprendre où joindre son émetteur ?

ID: ccna2-original-m1-4-005
Type: multiple
Notion: Apprentissage MAC
Difficulté: Facile

- [x] L’adresse MAC source
- [ ] L’adresse IP de la passerelle
- [x] Le port d’entrée
- [ ] Le numéro de port TCP destination

> Le switch associe la MAC source au port d’entrée dans le VLAN concerné. Il apprend ainsi où transmettre les futures trames destinées à cet émetteur.
> Référence : [Cisco — Tables MAC](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus3000/sw/layer2/93x/configuration/guide/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-101x/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-93x_chapter_01011.html).

## 6. Une trame unicast entre par Gi0/1. Sa MAC destination est associée à Gi0/4 dans le même VLAN. Tous les ports concernés transmettent normalement. Que fait le switch ?

ID: ccna2-original-m1-4-006
Type: simple
Notion: Commutation unicast
Difficulté: Facile

- [ ] Il la diffuse sur tous les VLAN
- [ ] Il la renvoie uniquement sur Gi0/1
- [x] Il la transmet sur Gi0/4
- [ ] Il remplace la MAC destination par son adresse de gestion

> Une entrée MAC connue permet une transmission ciblée vers le port de destination, dans le VLAN correspondant.
> Référence : [Cisco — Tables MAC](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus3000/sw/layer2/93x/configuration/guide/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-101x/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-93x_chapter_01011.html).

## 7. Une trame unicast inconnue entre par Gi0/1. Gi0/2 et Gi0/3 sont les seuls autres ports autorisés à transmettre dans ce VLAN. Quelles sorties sont utilisées ?

ID: ccna2-original-m1-4-007
Type: multiple
Notion: Unicast inconnu
Difficulté: Moyen

- [x] Gi0/2
- [ ] Gi0/1
- [x] Gi0/3
- [ ] Aucun port

> Le switch diffuse cette trame sur les autres ports autorisés du VLAN. Il ne la renvoie pas sur le port d’entrée.
> Référence : [Cisco — Unicast inconnu et tables MAC](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus3000/sw/layer2/93x/configuration/guide/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-101x/b-cisco-nexus-3000-nx-os-layer-2-configuration-guide-93x_chapter_01011.html).

## 8. En mode store-and-forward, le switch attend la réception complète d’une trame avant de commencer à la transmettre.

ID: ccna2-original-m1-4-008
Type: vrai_faux
Notion: Store-and-forward
Difficulté: Facile

- [x] Vrai
- [ ] Faux

> La réception complète permet notamment de vérifier le FCS avant la transmission. Le cut-through peut commencer à transmettre plus tôt.
> Référence : [Cisco — Commutation et contrôle FCS](https://www.cisco.com/c/en/us/support/docs/switches/nexus-9000-series-switches/216239-nexus-9000-cloud-scale-asic-crc-identifi.html).

## 9. En mode store-and-forward, le contrôle FCS d’une trame révèle une erreur. Quelle action est attendue ?

ID: ccna2-original-m1-4-009
Type: simple
Notion: Intégrité Ethernet
Difficulté: Facile

- [ ] Corriger automatiquement les bits endommagés
- [x] Rejeter la trame
- [ ] Diffuser la trame sur tous les ports
- [ ] Désactiver systématiquement le VLAN

> Un FCS incorrect signale une trame corrompue. Le switch la rejette ; le FCS ne fournit pas de mécanisme de réparation des données.
> Référence : [Cisco — Commutation et contrôle FCS](https://www.cisco.com/c/en/us/support/docs/switches/nexus-9000-series-switches/216239-nexus-9000-cloud-scale-asic-crc-identifi.html).

## 10. Gi0/1, Gi0/2 et Gi0/3 appartiennent au VLAN 24 ; Gi0/4 appartient au VLAN 34. Un broadcast entre par Gi0/1. Quels ports d’accès le reçoivent, s’ils sont tous actifs et sans filtrage ?

ID: ccna2-original-m1-4-010
Type: multiple
Notion: Domaine de broadcast
Difficulté: Moyen

- [ ] Gi0/1
- [x] Gi0/2
- [x] Gi0/3
- [ ] Gi0/4

> Le broadcast reste dans son VLAN et n’est pas retransmis sur le port d’entrée. Le VLAN 34 constitue un autre domaine de broadcast.
> Référence : [Cisco — Fonctionnement des VLAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/12-2_52_se/configuration/guide/3750scg/swvlan.html).

## 11. Le VLAN 24 existe déjà et Gi0/8 est en mode access. Quelle commande place ce port dans le VLAN 24 ?

ID: ccna2-original-m1-4-011
Type: simple
Notion: Port d’accès
Difficulté: Facile

- [ ] `switchport trunk native vlan 24`
- [ ] `encapsulation dot1Q 24`
- [ ] `ip default-gateway 24`
- [x] `switchport access vlan 24`

> Sur un port access, `switchport access vlan 24` définit le VLAN des données. Cette commande s’applique dans la configuration de l’interface.
> Référence : [Cisco — Affectation des ports aux VLAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750/software/release/12-2_52_se/configuration/guide/3750scg/swvlan.html).

## 12. Un trunk autorise les VLAN 12 et 24. Quelle commande ajoute le VLAN 34 sans retirer les deux premiers ?

ID: ccna2-original-m1-4-012
Type: simple
Notion: VLAN autorisés sur un trunk
Difficulté: Moyen

- [ ] `switchport trunk allowed vlan 34`
- [x] `switchport trunk allowed vlan add 34`
- [ ] `switchport access vlan 34`
- [ ] `switchport trunk native vlan 34`

> Le mot-clé `add` complète la liste existante. Définir seulement `allowed vlan 34` remplacerait la liste par le seul VLAN 34.
> Référence : [Cisco — Configuration des trunks](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst_digital_building_series_switches/software/15-2_7_e/configuration_guide/b_1527e_consolidated_cdb_cg/m_vlan_trunk_cg_2960-x.html).

## 13. Sur un trunk 802.1Q classique, sans activation du marquage du VLAN natif, les trames de données de ce VLAN sortent sans étiquette 802.1Q.

ID: ccna2-original-m1-4-013
Type: vrai_faux
Notion: VLAN natif
Difficulté: Moyen

- [x] Vrai
- [ ] Faux

> Le VLAN natif sert au trafic non marqué dans ce fonctionnement. Sa configuration doit être cohérente aux deux extrémités du trunk.
> Référence : [Cisco — VLAN natif et 802.1Q](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html).

## 14. Deux ports Cisco compatibles DTP sont tous deux en dynamic auto, sans autre configuration de trunk. Quel résultat est attendu ?

ID: ccna2-original-m1-4-014
Type: simple
Notion: Négociation DTP
Difficulté: Moyen

- [ ] Un trunk se forme obligatoirement
- [ ] Les deux ports s’éteignent
- [x] Le lien ne devient pas trunk par cette seule négociation
- [ ] Les VLAN des deux switches sont supprimés

> Le mode auto attend une initiative du voisin. Deux ports passifs ne déclenchent pas seuls la formation du trunk.
> Référence : [Cisco — Modes de négociation des trunks](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst_digital_building_series_switches/software/15-2_7_e/configuration_guide/b_1527e_consolidated_cdb_cg/m_vlan_trunk_cg_2960-x.html).

## 15. Le VLAN 34 existe des deux côtés d’un trunk actif, mais sa liste de VLAN autorisés contient seulement 12 et 24. Quel diagnostic convient ?

ID: ccna2-original-m1-4-015
Type: simple
Notion: Dépannage d’un trunk
Difficulté: Facile

- [x] Le trafic du VLAN 34 est exclu de ce trunk
- [ ] Le VLAN 34 traverse forcément le trunk puisqu’il existe
- [ ] Le VLAN 34 devient automatiquement le VLAN natif
- [ ] Chaque PC du VLAN 34 doit être configuré en mode trunk

> L’existence d’un VLAN ne suffit pas : le trunk doit aussi l’autoriser. Les listes doivent être vérifiées aux deux extrémités.
> Référence : [Cisco — VLAN autorisés sur les trunks](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9200/software/release/17-11/configuration_guide/vlan/b_1711_vlan_9200_cg/configuring_vlan_trunks.html).

## 16. Un switch limité à la couche 2 peut, à lui seul, router des paquets entre deux VLAN et deux sous-réseaux IPv4 différents.

ID: ccna2-original-m1-4-016
Type: vrai_faux
Notion: Routage inter-VLAN
Difficulté: Facile

- [ ] Vrai
- [x] Faux

> Cette communication nécessite une fonction de couche 3, fournie par exemple par un routeur ou par un switch multicouche configuré pour router.
> Référence : [Cisco — Routage inter-VLAN](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/41260-189.html).

## 17. Sur un routeur, Gi0/0.124 est configurée avec encapsulation dot1Q 24. À quel VLAN cette sous-interface correspond-elle ?

ID: ccna2-original-m1-4-017
Type: simple
Notion: Sous-interface 802.1Q
Difficulté: Moyen

- [ ] Au VLAN 124 obligatoirement
- [ ] Au VLAN 1 obligatoirement
- [x] Au VLAN 24
- [ ] À tous les VLAN simultanément

> L’identifiant donné à `encapsulation dot1Q` détermine le VLAN associé. Le suffixe numérique de la sous-interface est un identifiant local.
> Référence : [Cisco — Sous-interfaces et routeur externe](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html).

## 18. Un routeur doit desservir les VLAN 24 et 34 par un seul câble vers un switch. Quel mode convient au port du switch relié au routeur ?

ID: ccna2-original-m1-4-018
Type: simple
Notion: Router-on-a-stick
Difficulté: Facile

- [ ] Access dans le VLAN 24 uniquement
- [x] Trunk 802.1Q transportant les VLAN 24 et 34
- [ ] Access dans le VLAN 34 uniquement
- [ ] Port désactivé

> Le trunk transporte plusieurs VLAN sur le même lien. Les sous-interfaces du routeur assurent ensuite le routage de leurs sous-réseaux.
> Référence : [Cisco — Routage par un routeur externe](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/14976-50.html).

## 19. Sur un Catalyst multicouche compatible, les SVI sont correctement adressées et actives. Quelle commande globale active le routage IPv4 entre leurs réseaux ?

ID: ccna2-original-m1-4-019
Type: simple
Notion: Routage sur switch multicouche
Difficulté: Facile

- [ ] `switchport mode trunk`
- [ ] `ip default-gateway 10.24.0.1`
- [ ] `transport input ssh`
- [x] `ip routing`

> `ip routing` active la fonction de routage IPv4. Les SVI et les VLAN doivent également être opérationnels pour utiliser leurs réseaux connectés.
> Référence : [Cisco — Activation du routage sur Catalyst](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/41260-189.html).

## 20. Les passerelles sont 10.24.0.1/24 pour le VLAN 24 et 10.34.0.1/24 pour le VLAN 34. Quelles deux affectations sont correctes pour des PC de ces sous-réseaux ?

ID: ccna2-original-m1-4-020
Type: multiple
Notion: Passerelle des hôtes
Difficulté: Facile

- [x] PC du VLAN 24 : passerelle 10.24.0.1
- [ ] PC du VLAN 24 : passerelle 10.34.0.1
- [ ] PC du VLAN 34 : passerelle 10.24.0.1
- [x] PC du VLAN 34 : passerelle 10.34.0.1

> Chaque PC utilise la passerelle de son propre sous-réseau pour joindre les destinations distantes. La passerelle d’un autre VLAN ne convient pas à ce plan d’adressage.
> Référence : [Cisco — Passerelles et interfaces VLAN](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/41260-189.html).
