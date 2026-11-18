# ATLAS LIBRARY — Mise en service de la base partagée

Cette branche prépare la collaboration entre vendeurs avec **Supabase (PostgreSQL, authentification, RLS et Realtime)**. Le site GitHub Pages reste un site statique public : seules les données stockées sur Supabase sont protégées par les droits serveur.

## 1. Sauvegarder les données avant migration
Sur **chaque ordinateur** ayant des fiches modifiées, ouvrir le site actuel et télécharger une sauvegarde JSON. Conserver ces fichiers dans un emplacement sécurisé. Ne pas importer plusieurs versions contradictoires sans vérifier les doublons.

## 2. Créer le projet Supabase
1. Créer un projet au nom de l'entreprise dans Supabase, de préférence dans une région UE adaptée.
2. Ouvrir **SQL Editor** et exécuter l'intégralité de `supabase/schema.sql`.
3. Sous **Authentication → Users**, inviter le premier utilisateur professionnel.
4. Une fois son UUID visible, ajouter sa ligne dans **SQL Editor** :

```sql
insert into public.atlas_team_members(user_id,email,display_name,role,active)
values ('UUID_REEL','admin@entreprise.fr','Administrateur','admin',true);
```

5. Inviter les autres collaborateurs et ajouter une ligne par UUID avec le rôle `editor` (lecture + modification), `viewer` (lecture seule), ou `admin` (tous droits).
6. Désactiver les inscriptions publiques et utiliser uniquement les invitations. Mettre en place MFA et les politiques de session appropriées avec votre responsable informatique.

Les quatre avatars graphiques ne sont **pas** une authentification : l'identité réelle provient du compte Supabase.

## 3. Relier ATLAS LIBRARY au projet
Dans le fichier `config.js`, renseigner **uniquement** l'URL du projet et sa clé publique publishable (ou ancienne clé anon) :

```javascript
window.ATLAS_CONFIG = {
  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',
  publishableKey: 'CLE_PUBLIQUE'
};
```

Ne **jamais** mettre de clé `service_role`, de mot de passe SQL, ni de secret serveur dans le dépôt. GitHub Pages rend tous ces fichiers lisibles publiquement ; les règles RLS empêchent l'accès aux fiches protégées.

**Activation conditionnelle :** avec `config.js` non renseigné, le site garde son fonctionnement local historique. Avec une configuration valide, la connexion Supabase devient obligatoire pour lire et modifier la base partagée.

## 4. Importer le catalogue
Après connexion comme administrateur :
1. Cliquer sur **Importer le catalogue** : ajoute les fiches préremplies sans écraser celles déjà stockées sur Supabase.
2. Pour les changements antérieurs sur le même navigateur, utiliser **Importer données locales**, après sauvegarde. Cette opération met à jour les fiches de mêmes identifiants ; elle ne réalise pas une fusion intelligente.
3. Pour un fichier JSON téléchargé auparavant, utiliser **Import**. Attention : les fiches portant le même identifiant peuvent être remplacées. Ne pas importer plusieurs copies sans contrôle.
4. Tester la modification d'une fiche avec un vendeur et son affichage sur le compte d'un autre vendeur. La synchronisation se fait via Realtime ou avec le bouton **Actualiser**.

## 5. Autorisations

| Rôle | Lire | Ajouter / modifier | Supprimer | Importer |
|---|---:|---:|---:|---:|
| admin | Oui | Oui | Oui | Oui |
| editor | Oui | Oui | Non | Non |
| viewer | Oui | Non | Non | Non |

Ces autorisations sont imposées côté **PostgreSQL avec RLS**. Le statut d'un avatar choisi ne confère jamais de droits.

## 6. Limites et sécurité avant production
- **Le catalogue initial intégré dans `index.html` reste public** sur GitHub Pages. Il est constitué de données de démarrage non confidentielles ; ne jamais y écrire de coordonnées privées. Pour rendre même ce catalogue privé, il faudra le supprimer du HTML servi publiquement **après** son import dans Supabase et l'héberger uniquement côté serveur.
- Supabase n'est pas encore créé ni configuré par cette branche. Les tables, utilisateurs et données partagées n'existent pas tant que vous ne suivez pas les étapes ci-dessus.
- Le service a besoin d'Internet pour la connexion et la synchronisation. Le globe 3D reste local à l'interface.
- Les mises à jour concurrentes d'une même fiche utilisent actuellement la logique **dernier enregistrement gagnant**. Il faudra prévoir l'historique d'audit et, si nécessaire, la gestion des conflits.
- Les sauvegardes Supabase et les tests de restauration sont à organiser côté administrateur. Un export JSON n'est pas une sauvegarde serveur automatisée.
- Testez la gestion des droits, l'import, la synchronisation, la fermeture de session et l'accès anonyme avec des données fictives **avant de fusionner** la branche sur le site public.
- La connexion sécurise les données Supabase, mais **l'interface GitHub Pages demeure publique** : envisager Cloudflare Access / un hébergement privé si vous souhaitez également restreindre l'accès aux pages elles-mêmes.

## Fichiers
- `supabase/schema.sql` : création des tables, rôles, trigger et règles RLS.
- `config.js` : paramètres publics de connexion (à compléter).
- `shared-db.js` : authentification, stockage partagé, import et synchronisation.
- `index.html` : interface et branchement du mode partagé.
