// Configuration du serveur Supabase du groupe.
// Ces deux valeurs sont publiques par conception (la sécurité repose sur les règles RLS de supabase/schema.sql).
// Laisse-les vides pour utiliser l'appli en mode local (données dans le navigateur uniquement).
window.ATELIER_CONFIG = {
  supabaseUrl: "https://jvzwoialynhvhwkccgba.supabase.co",
  supabaseAnonKey: "sb_publishable_gSJS6PEl2YYA5yg_4hleGQ_lfwn-Ggv",
  // Clé publique des notifications push (la clé privée correspondante est dans les secrets Supabase)
  vapidPublicKey: "BIiDFNNAx9bdpVGOEBLHrELBqwAKaZEhwSXjjCUgWtjlKtXsF6WhUkxmEM9By7vTzAPBi68twN8mwwQBKhxB9eE",
};
