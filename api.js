// ==========================================
// KURIR API (api.js) - Taruh di root Vercel
// ==========================================

async function ambilBerita() {
    // URL API RAHASIA DI AEONFREE
    const AEONFREE_API_URL = 'https://obfustext.is-great.org/api.php';

    // KUNCI RAHASIA (SAMAIN SAMA YANG DI api.php)
    const SECRET_KEY = "KunciRahasiaDarkweb2026";

    try {
        // Nembak Aeonfree bawa kunci rahasia
        const response = await fetch(AEONFREE_API_URL, {
            method: 'GET',
            headers: {
                'X-API-KEY': SECRET_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Aeonfree nolak request. Status: ${response.status}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error Fetch:", error);
        return { error: error.message };
    }
}