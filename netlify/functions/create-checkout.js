exports.handler = async (event, context) => {
  console.log('=== Checkout Function Start ===');
  console.log('Method:', event.httpMethod);
  
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

    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden in Environment Variables');
    }

    // Stripe initialisieren
    const stripe = require('stripe')(stripeKey);
    console.log('✅ Stripe initialisiert');

    // Request Body parsen
    const { items } = JSON.parse(event.body || '{}');
    console.log('📦 Items empfangen:', items);

    // Bestellnummer generieren - Datum Format
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `AK-${month}${day}${year}-${random}`;
    console.log('🔢 Bestellnummer generiert:', orderNumber);

    // Versandkosten berechnen
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const freeShippingThreshold = 150;
    const shippingCost = subtotal >= freeShippingThreshold ? 0 : 0.40; // CHF 0.40 Versand (TEST)
    
    console.log(`📊 Subtotal: CHF ${subtotal}`);
    console.log(`🚚 Versandkosten: CHF ${shippingCost}`);

    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('❌ Keine gültigen Items');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keine Artikel im Warenkorb' })
      };
    }

    // Line Items erstellen
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.name || 'Unbekanntes Produkt'
        },
        unit_amount: Math.round((item.price || 0) * 100)
      },
      quantity: item.quantity || 1
    }));

    // Versandkosten hinzufügen
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: `Versandkosten (Gratis ab CHF ${freeShippingThreshold})`
          },
          unit_amount: Math.round(shippingCost * 100)
        },
        quantity: 1
      });
    }

    console.log('💳 Line Items erstellt:', lineItems.length);

    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal', 'twint'],
      line_items: lineItems,
      mode: 'payment',
      client_reference_id: orderNumber,
      success_url: isTest 
        ? `https://aesthetikoase.webflow.io/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`
        : `https://xn--sthetikoase-k8a.ch/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`,
      cancel_url: isTest 
        ? `https://aesthetikoase.webflow.io/checkout`
        : `https://xn--sthetikoase-k8a.ch/checkout`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT']
      },
      billing_address_collection: 'required',
      metadata: {
        order_number: orderNumber,
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
