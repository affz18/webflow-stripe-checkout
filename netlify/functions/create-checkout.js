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
    
    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('❌ Keine gültigen Items');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keine Artikel im Warenkorb' })
      };
    }

    // Stripe Line Items erstellen
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

    console.log('💳 Line Items erstellt:', lineItems.length);

    // Stripe Checkout Session erstellen
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'card',           // Kreditkarten (Visa, Mastercard, etc.)
        'twint',          // TWINT (Schweiz)
        'paypal',         // PayPal
        'apple_pay',      // Apple Pay
        'google_pay'      // Google Pay
      ],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT', 'FR', 'IT'], // Erweitert für PayPal
      },
      billing_address_collection: 'required',
      // Automatische Steuern (falls aktiviert)
      automatic_tax: {
        enabled: false // Setze auf true falls du Stripe Tax verwendest
      },
      metadata: {
        order_source: 'webflow_custom',
        environment: isTest ? 'test' : 'production',
        total_items: items.length.toString(),
        payment_methods: 'card,twint,paypal,apple_pay,google_pay'
      }
    });

    console.log('✅ Stripe Session erstellt:', session.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id,
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
