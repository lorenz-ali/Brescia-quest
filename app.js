// --- VARIABILI DI STATO DEL GIOCO ---
let playerXP = 0;
let playerLevel = 1;
const xpPerLivello = 300;
let map, userMarker;
let markersAttivi = []; // Tiene traccia dei PIN visualizzati sulla mappa
let categoriaCorrente = 'tutti';
let ultimaPosizioneUtente = null; // 📍 Memorizza l'ultima posizione GPS ricevuta

// --- INIZIALIZZAZIONE DEL GIOCO ---
function initGioco() {
    // Inizializza la mappa globale centrata inizialmente su Via Milano a Brescia
    map = L.map('map').setView([45.5415, 10.2012], 14);

    // Carica la grafica della mappa gratuita da OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Mostra i punti e la lista obiettivi iniziale
    aggiornaMappaELista();

    // Attiva il tracciamento del GPS del telefono
    attivaGPS();
}

// --- GESTIONE DEI FILTRI E DEI PIN ---
function aggiornaMappaELista() {
    // 1. Pulisce i vecchi PIN dalla mappa per evitare doppioni
    markersAttivi.forEach(m => map.removeLayer(m));
    markersAttivi = [];

    // 2. Svuota il contenitore del Registro Missioni (Wishlist) nell'HTML
    const containerLista = document.getElementById('lista-monumenti');
    containerLista.innerHTML = "";

    // 3. Cicla sui monumenti di Brescia per inserire solo quelli filtrati
    monumenti.forEach(m => {
        if (categoriaCorrente === 'tutti' || m.categoria === categoriaCorrente) {
            
            // --- AGGIUNGI PIN ALLA MAPPA ---
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            
            if (m.scoperto) {
                marker.bindPopup(`<b>✅ ${m.nome}</b><br>${m.desc}`);
            } else {
                marker.bindPopup(`<b>🔒 Luogo Bloccato</b><br>Avvicinati a meno di 50 metri con il GPS per conquistare questo obiettivo!`);
            }
            
            markersAttivi.push(marker);
            m.markerRef = marker;

            // --- CALCOLO DISTANZA DINAMICA PER LA SIDEBAR ---
            let testoDistanza = '🔒 Distanza: Calcolo in corso...';
            if (!m.scoperto && ultimaPosizioneUtente) {
                const d = calcolaDistanza(ultimaPosizioneUtente.lat, ultimaPosizioneUtente.lng, m.lat, m.lng);
                // Se la distanza è maggiore di 1000 metri mostra i km, altrimenti i metri
                testoDistanza = d >= 1000 ? `📍 Distanza: ${(d/1000).toFixed(1)} km` : `📍 Distanza: ${Math.round(d)} metri`;
            } else if (m.scoperto) {
                testoDistanza = '🟢 Obiettivo Conquistato';
            }

            // --- AGGIUNGI RIGA AL REGISTRO DELLE MISSIONI (HTML) ---
            const item = document.createElement('div');
            item.className = `p-3 rounded-xl flex justify-between items-center transition-all ${
                m.scoperto ? 'bg-green-950/40 border border-green-500' : 'bg-gray-700/50 border border-gray-600'
            }`;
            
            item.innerHTML = `
                <div>
                    <p class="font-semibold text-sm ${m.scoperto ? 'text-green-400' : 'text-gray-200'}">${m.nome}</p>
                    <p class="text-xs text-gray-400 font-mono">${testoDistanza}</p>
                </div>
                <div class="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded-md">
                    ${m.scoperto ? '🏆' : '+100 XP'}
                </div>
            `;
            containerLista.appendChild(item);
        }
    });
}

function filtraCategoria(categoria) {
    categoriaCorrente = categoria;
    aggiornaMappaELista();
}

// --- SISTEMA GPS (GEOLOCALIZZAZIONE) ---
function attivaGPS() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const uLat = position.coords.latitude;
                const uLng = position.coords.longitude;

                // Salva la posizione per poter aggiornare le distanze nella wishlist
                ultimaPosizioneUtente = { lat: uLat, lng: uLng };

                // Crea l'avatar (cerchietto blu) o aggiorna la sua posizione
                if (!userMarker) {
                    userMarker = L.circleMarker([uLat, uLng], { 
                        radius: 12, 
                        color: '#ffffff', 
                        fillColor: '#3b82f6', 
                        fillOpacity: 0.9,
                        weight: 3
                    }).addTo(map);
                    
                    map.setView([uLat, uLng], 16); 
                } else {
                    userMarker.setLatLng([uLat, uLng]);
                }

                // Controlla prossimità e aggiorna l'interfaccia con le nuove distanze
                controllaProssimita(uLat, uLng);
            },
            (error) => { console.warn("Errore ricezione GPS: ", error.message); },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        alert("Questo telefono o browser non supporta la geolocalizzazione.");
    }
}

// --- FORMULA HAVERSINE ---
function calcolaDistanza(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raggio terrestre in metri
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distanza precisa in metri
}

// --- MECCANICA DI GIOCO: GEOFENCING E SBLOCCO BADGE ---
function controllaProssimita(userLat, userLng) {
    let haSbloccatoQualcosa = false;

    monumenti.forEach(m => {
        if (!m.scoperto) {
            const distanza = calcolaDistanza(userLat, userLng, m.lat, m.lng);
            
            // Sblocca il Badge se l'utente si trova a meno di 50 metri dal posto
            // NOTA: mantengo temporaneamente il tuo raggio esteso per i tuoi test da casa!
            if (distanza <= 50000) { 
                m.scoperto = true;
                assegnaXP(100);
                mostraPopupScoperta(m);
                haSbloccatoQualcosa = true;
            }
        }
    });

    // Se non ha sbloccato nulla ma si è mosso, aggiorna comunque la lista per mostrare i metri che calano!
    aggiornaMappaELista();
}

// --- ASSEGNAZIONE PUNTEGGIO E LIVELLI ---
function assegnaXP(punti) {
    playerXP += punti;
    
    if (playerXP >= xpPerLivello) {
        playerLevel++;
        playerXP -= xpPerLivello;
        document.getElementById('livello-txt').innerText = playerLevel;
    }
    
    document.getElementById('xp-txt').innerText = playerXP;
    const percentuale = (playerXP / xpPerLivello) * 100;
    document.getElementById('xp-bar').style.width = `${percentuale}%`;
}

// --- VISUALIZZAZIONE DEL POP-UP DI SUCCESSO ---
function mostraPopupScoperta(m) {
    document.getElementById('popup-nome').innerText = m.nome;
    document.getElementById('popup-desc').innerText = m.desc;
    document.getElementById('popup-scoperta').classList.remove('hidden');
}

function chiudiPopup() {
    document.getElementById('popup-scoperta').classList.add('hidden');
}
