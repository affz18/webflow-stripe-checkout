exports.handler = async (event, context) => {
  console.log('=== Checkout Function Start ===');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', JSON.stringify(event.headers, null, 2));
  
  // CORS Headers - Sehr permissiv
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Max-Age': '86400'
  };

  // OPTIONS Request für CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('✅ CORS Preflight Request beantwortet');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS OK' })
    };
  }

  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
    console.log('❌ Falsche HTTP Method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Nur POST erlaubt' })
    };
  }

  try {
    // Stripe Key auswählen basierend auf Origin
    const origin = event.headers.origin || event.headers.referer || '';
    const isTest = origin.includes('.webflow.io');
    
    let stripeKey;
    if (isTest) {
      stripeKey = process.env.STRIPE_SECRET_KEY; // Test Key
      console.log('🧪 WEBFLOW TEST MODE - Verwende Test Keys');
    } else {
      stripeKey = process.env.STRIPE_Prod; // Live Key
      console.log('🟢 PRODUCTION MODE - Verwende Live Keys');
    }

    // Prüfe ob Stripe Key existiert
    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden in Environment Variables');
    }

    // Stripe initialisieren
    const stripe = require('stripe')(stripeKey);
    console.log('✅ Stripe initialisiert');

    // Request Body parsen
    const { items } = JSON.parse(event.body || '{}');
    console.log('📦 Items empfangen:', items);

    // 🆕 BESTELLNUMMER GENERIEREN
    const generateOrderNumber = () => {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substr(2, 4).toUpperCase();
      return `AK-${timestamp}-${random}`;
    };
    
    const orderNumber = generateOrderNumber();
    console.log('🔢 Bestellnummer generiert:', orderNumber);

    // SCHRITT 1: Versandkosten berechnen
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const freeShippingThreshold = 150; // CHF 150 für gratis Versand
    const shippingCost = subtotal >= freeShippingThreshold ? 0 : 0.40; // CHF 0.40 Versand (TEST)
    
    console.log(`📊 Subtotal: CHF ${subtotal}`);
    console.log(`🚚 Versandkosten: CHF ${shippingCost} (Gratis ab CHF ${freeShippingThreshold})`);

    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('❌ Keine gültigen Items');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keine Artikel im Warenkorb' })
      };
    }

    // SCHRITT 2: Stripe Line Items erstellen (Produkte + Versand)
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.name || 'Unbekanntes Produkt',
          metadata: {
            source: 'webflow_checkout'
          }
        },
        unit_amount: Math.round((item.price || 0) * 100), // In Rappen
      },
      quantity: item.quantity || 1,
    }));

    // SCHRITT 3: Versandkosten als separates Line Item hinzufügen (falls > 0)
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: `Versandkosten (Gratis ab CHF ${freeShippingThreshold})`,
            metadata: {
              type: 'shipping',
              free_shipping_threshold: freeShippingThreshold.toString()
            }
          },
          unit_amount: Math.round(shippingCost * 100), // In Rappen
        },
        quantity: 1,
      });
      console.log(`📦 Versandkosten hinzugefügt: CHF ${shippingCost}`);
    } else {
      console.log(`🆓 GRATIS VERSAND! (Bestellung über CHF ${freeShippingThreshold})`);
    }

    console.log('💳 Line Items erstellt:', lineItems.length);

    // Stripe Checkout Session erstellen - Intelligente URL Weiterleitung
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card',           // Kreditkarten ✅
        'paypal',         // PayPal ✅ 
        'twint'           // TWINT ✅
      ],
      line_items: lineItems,
      mode: 'payment',
    // Stripe Checkout Session erstellen - Intelligente URL Weiterleitung
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card',           // Kreditkarten ✅
        'paypal',         // PayPal ✅ 
        'twint'           // TWINT ✅
      ],
      line_items: lineItems,
      mode: 'payment',
      // 🆕 Bestellnummer in Payment Intent Description
      payment_intent_data: {
        description: `Bestellung ${orderNumber}`, // Sichtbar in Zahlungsübersicht!
        metadata: {
          order_number: orderNumber
        }
      },
      // 🆕 NUR die wichtigsten Bestellnummer-Felder
      client_reference_id: orderNumber,
      // INTELLIGENTE SUCCESS/CANCEL URLs basierend auf Origin
      success_url: isTest 
        ? `https://aesthetikoase.webflow.io/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`
        : `https://xn--sthetikoase-k8a.ch/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`,
      cancel_url: isTest 
        ? `https://aesthetikoase.webflow.io/checkout`
        : `https://xn--sthetikoase-k8a.ch/checkout`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT'],
      },
      billing_address_collection: 'required',
      metadata: {
        order_number: orderNumber, // 🆕 Einfache Bestellnummer
        order_source: 'webflow_custom',
        environment: isTest ? 'test' : 'production'
      }
    });

    console.log('✅ Stripe Session erstellt:', session.id);
    console.log('🔢 Mit Bestellnummer:', orderNumber);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id,
        order_number: orderNumber,
        environment: isTest ? 'test' : 'production'
      })
    };

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    console.error('Stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server Fehler',
        details: error.message 
      })
    };
  }
};
