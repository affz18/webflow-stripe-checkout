<script>
document.addEventListener('DOMContentLoaded', function() {
  console.log('Webflow Stripe Checkout Integration geladen');
  
  // Warte bis Webflow E-Commerce geladen ist
  setTimeout(function() {
    initCustomCheckout();
  }, 1000);
});

function initCustomCheckout() {
  // Finde den Webflow Checkout Button
  const webflowCheckoutBtn = document.querySelector('[data-node-type="commerce-checkout-place-order-button"]');
  
  if (!webflowCheckoutBtn) {
    console.log('Webflow Checkout Button nicht gefunden');
    return;
  }
  
  console.log('Webflow Checkout Button gefunden');
  
  // Event Listener hinzufügen
  webflowCheckoutBtn.addEventListener('click', function(e) {
    e.preventDefault(); // Verhindert normalen Webflow Checkout
    console.log('Custom Checkout gestartet');
    
    // Loading State anzeigen
    webflowCheckoutBtn.textContent = 'Lade Checkout...';
    webflowCheckoutBtn.disabled = true;
    
    // Warenkorb-Daten aus Webflow auslesen
    const cartData = getWebflowCartData();
    
    if (!cartData || cartData.length === 0) {
      alert('Ihr Warenkorb ist leer');
      resetCheckoutButton();
      return;
    }
    
    // Stripe Checkout Session erstellen
    createStripeCheckout(cartData);
  });
}

function getWebflowCartData() {
  try {
    console.log('=== WEBFLOW BINDINGS EXTRAKTION ===');
    
    let finalPrice = 0;
    let cartItems = [];
    
    // SCHRITT 1: Suche nach Webflow Bindings
    console.log('🔍 Suche nach Webflow Bindings...');
    
    const allElements = document.querySelectorAll('[data-wf-bindings]');
    console.log(`Gefunden: ${allElements.length} Elemente mit data-wf-bindings`);
    
    let productNames = [];
    let productQuantities = [];
    let productPrices = [];
    
    allElements.forEach((element, index) => {
      const bindings = element.getAttribute('data-wf-bindings');
      const text = element.textContent || element.innerText || '';
      
      console.log(`Element ${index}: "${bindings}" = "${text}"`);
      
      // Extrahiere Produktnamen (aber filtere "Produkt X" Namen aus)
      if (bindings && bindings.includes('f_name_')) {
        const cleanName = text.trim();
        if (cleanName && cleanName.length > 2 && !cleanName.match(/^Produkt\s+\d+$/)) {
          productNames.push(cleanName);
          console.log(`📦 PRODUKTNAME: "${cleanName}"`);
        }
      }
      
      // Extrahiere Mengen
      if (bindings && bindings.includes('count%2')) {
        const quantity = parseInt(text.trim());
        if (!isNaN(quantity) && quantity > 0) {
          productQuantities.push(quantity);
          console.log(`🔢 MENGE: ${quantity}`);
        }
      }
      
      // Extrahiere Preise
      if (bindings && (bindings.includes('price%2') || text.includes('CHF'))) {
        const allDigits = text.replace(/[^\d]/g, '');
        if (allDigits.length >= 3) {
          const cents = allDigits.slice(-2);
          const mainPart = allDigits.slice(0, -2);
          const price = parseFloat(mainPart + '.' + cents);
          if (price > 0) {
            productPrices.push(price);
            console.log(`💰 PREIS: CHF ${price}`);
          }
        }
      }
    });
    
    // SCHRITT 2: Intelligente Produktfilterung
    const validProductNames = productNames.filter(name => 
      name && 
      name.length > 2 && 
      !name.match(/^Produkt\s+\d+$/) &&
      name.toLowerCase() !== 'undefined' &&
      name.toLowerCase() !== 'null'
    );
    
    const validQuantities = productQuantities.filter(qty => qty > 0);
    const validPrices = productPrices.filter(price => price > 0);
    
    console.log('=== GEFILTERTE DATEN ===');
    console.log('Gültige Produktnamen:', validProductNames);
    console.log('Gültige Mengen:', validQuantities);
    console.log('Gültige Preise:', validPrices);
    
    // Verwende die kleinste Anzahl als Basis
    const actualProductCount = Math.min(
      validProductNames.length,
      validQuantities.length,
      validPrices.length
    );
    
    console.log(`🎯 Erkannte Produktanzahl: ${actualProductCount}`);
    
    // Erstelle Produkte
    for (let i = 0; i < actualProductCount; i++) {
      const name = validProductNames[i];
      const quantity = validQuantities[i];
      const price = validPrices[i];
      
      if (name && quantity && price) {
        cartItems.push({
          name: name,
          price: price,
          quantity: quantity
        });
        
        console.log(`✅ PRODUKT ${i + 1}: "${name}" - ${quantity}x CHF ${price}`);
      }
    }
    
    // SCHRITT 3: Gesamtpreis aus Total-Element
    const totalElement = document.querySelector('.w-commerce-commercecheckoutsummarytotal');
    
    if (totalElement) {
      const text = totalElement.textContent || totalElement.innerText || '';
      const allDigits = text.replace(/[^\d]/g, '');
      
      if (allDigits.length >= 3) {
        const cents = allDigits.slice(-2);
        const mainPart = allDigits.slice(0, -2);
        finalPrice = parseFloat(mainPart + '.' + cents);
        console.log(`🎯 KORREKTER GESAMTPREIS: CHF ${finalPrice}`);
      }
    }
    
    // Validierung und Preiskorrektur
    const calculatedTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    console.log(`🧮 Einzelprodukte ergeben: CHF ${calculatedTotal}`);
    console.log(`🏷️ Webflow Total zeigt: CHF ${finalPrice}`);
    
    if (Math.abs(calculatedTotal - finalPrice) > 1) {
      console.log(`⚠️ DIFFERENZ erkannt - verwende Webflow Total: CHF ${finalPrice}`);
      
      if (cartItems.length > 0) {
        const factor = finalPrice / calculatedTotal;
        cartItems.forEach(item => {
          item.price = Math.round(item.price * factor * 100) / 100;
        });
        console.log(`🔧 Produktpreise korrigiert mit Faktor ${factor.toFixed(3)}`);
      }
    }
    
    // SCHRITT 4: Fallback falls keine Produkte gefunden
    if (cartItems.length === 0) {
      console.log('⚠️ Keine Produkte über Bindings gefunden, verwende Fallback');
      cartItems = [{
        name: 'Beauty Bestellung (Details über Bindings nicht verfügbar)',
        price: finalPrice || 100.00,
        quantity: 1
      }];
    }
    
    console.log('🎯 FINALE BESTELLUNG:');
    cartItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.quantity}x CHF ${item.price} = CHF ${(item.quantity * item.price).toFixed(2)}`);
    });
    
    const grandTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    console.log(`💰 GESAMTSUMME: CHF ${grandTotal.toFixed(2)}`);
    
    return cartItems;
    
  } catch (error) {
    console.error('❌ Fehler beim Auslesen der Warenkorb-Daten:', error);
    return [{
      name: 'ERROR - Fallback Bestellung',
      price: 100.00,
      quantity: 1
    }];
  }
}

async function createStripeCheckout(cartItems) {
  try {
    // Verbesserte Environment-Erkennung
    const hostname = window.location.hostname;
    const isWebflowTest = hostname.includes('.webflow.io');
    const isNetlifyStaging = hostname.includes('staging') || hostname.includes('netlify.app');
    
    console.log(`🔍 Aktuelle Domain: ${hostname}`);
    console.log(`🔍 isWebflowTest: ${isWebflowTest}`);
    
    // TEMPORÄRE LÖSUNG: Gleiche Function, aber Header prüfen
    functionUrl = 'https://chipper-melomakarona-9da7ab.netlify.app/.netlify/functions/create-checkout';
    
    if (isWebflowTest) {
      console.log('🧪 WEBFLOW TEST MODE - Function wird Test Keys verwenden');
    } else {
      console.log('🟢 PRODUCTION MODE - Function wird Live Keys verwenden');
    }
    
    console.log(`Aktuell auf: ${window.location.hostname}`);
    console.log('Sende Daten an:', functionUrl);
    console.log('Cart Items:', cartItems);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: cartItems
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Stripe Response:', data);
    
    if (data.url) {
      console.log('Weiterleitung zu Stripe Checkout');
      window.location.href = data.url;
    } else {
      throw new Error('Keine Checkout URL erhalten');
    }
    
  } catch (error) {
    console.error('Checkout Fehler:', error);
    alert('Fehler beim Laden des Checkouts. Bitte versuchen Sie es erneut.');
    resetCheckoutButton();
  }
}

function resetCheckoutButton() {
  const btn = document.querySelector('[data-node-type="commerce-checkout-place-order-button"]');
  if (btn) {
    btn.textContent = 'Bestellen';
    btn.disabled = false;
  }
}

// Debug: Warenkorb-Inhalt anzeigen (zum Testen)
function showCartDebug() {
  const cartData = getWebflowCartData();
  console.log('Debug - Aktueller Warenkorb:', cartData);
}
</script>
