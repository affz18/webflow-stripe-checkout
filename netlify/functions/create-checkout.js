<script>
document.addEventListener('DOMContentLoaded', function() {
  console.log('Success Page geladen');
  
  // Prüfe ob eine session_id vorhanden ist (= erfolgreiche Stripe Zahlung)
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  
  if (sessionId) {
    console.log('Erfolgreiche Zahlung erkannt, leere Warenkorb');
    clearWebflowCart();
    
    // Optional: Session ID in der UI anzeigen
    const sessionElement = document.getElementById('session-id');
    if (sessionElement) {
      sessionElement.textContent = sessionId;
    }
  } else {
    console.log('Keine Session ID gefunden - möglicherweise direkter Zugriff');
  }
});

function clearWebflowCart() {
  try {
    // Webflow Warenkorb aus localStorage löschen
    localStorage.removeItem('wf-cart-items');
    localStorage.removeItem('wf-cart');
    localStorage.removeItem('webflow-cart');
    
    // Auch andere mögliche Webflow Cart Keys löschen
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (key.includes('cart') || key.includes('commerce')) {
        localStorage.removeItem(key);
        console.log(`Entfernt: ${key}`);
      }
    });
    
    // Webflow Commerce API aufrufen falls verfügbar
    if (window.Webflow && window.Webflow.commerce) {
      try {
        // Versuche Webflow's eigene Clear-Funktion
        if (window.Webflow.commerce.cart && window.Webflow.commerce.cart.clear) {
          window.Webflow.commerce.cart.clear();
          console.log('Webflow Commerce Cart geleert');
        }
      } catch (e) {
        console.log('Webflow Commerce API nicht verfügbar');
      }
    }
    
    // Session Storage auch leeren
    sessionStorage.clear();
    
    // Warenkorb-Anzeige aktualisieren (falls sichtbar)
    updateCartDisplay();
    
    console.log('Warenkorb erfolgreich geleert');
    
  } catch (error) {
    console.error('Fehler beim Leeren des Warenkorbs:', error);
  }
}

function updateCartDisplay() {
  // Aktualisiere Warenkorb-Anzeige im Header
  const cartCountElements = document.querySelectorAll('[data-wf-cart-quantity], .cart-quantity, .cart-count');
  cartCountElements.forEach(el => {
    el.textContent = '0';
  });
  
  // Verstecke Warenkorb-Inhalt
  const cartElements = document.querySelectorAll('.w-commerce-commercecartcontainerwrapper');
  cartElements.forEach(el => {
    el.style.display = 'none';
  });
  
  // Zeige "Warenkorb ist leer" Nachricht
  const emptyCartElements = document.querySelectorAll('.w-commerce-commercecartemptystate');
  emptyCartElements.forEach(el => {
    el.style.display = 'block';
  });
}

// Optional: Verhindere zurück-Navigation zur Checkout-Seite
window.addEventListener('beforeunload', function() {
  // Entferne Checkout-URL aus der Browser-Historie
  if (document.referrer && document.referrer.includes('checkout')) {
    history.replaceState(null, null, window.location.href);
  }
});
</script>
