// Configuration du serveur Supabase du groupe.
// Ces deux valeurs sont publiques par conception (la sécurité repose sur les règles RLS de supabase/schema.sql).
// Laisse-les vides pour utiliser l'appli en mode local (données dans le navigateur uniquement).
window.ATELIER_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
