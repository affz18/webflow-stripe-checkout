exports.handler = async (event, context) => {
  // CORS Headers - Sehr permissiv
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Max-Age': '86400'
  };
  
  // OPTIONS Request für CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS OK' })
    };
  }
  
  // Nur POST erlauben
  if (event.httpMethod !== 'POST') {
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
    
    const stripeKey = isTest ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_Prod;
    
    if (!stripeKey) {
      throw new Error('Stripe Key nicht gefunden');
    }
    
    // Stripe initialisieren
    const stripe = require('stripe')(stripeKey);
    
    // Request Body parsen - KORRIGIERTE Version ohne Doppeldeklaration
    const requestBody = JSON.parse(event.body || '{}');
    const requestItems = requestBody.items;
    const requestShipping = requestBody.shipping || null;
    
    console.log('📦 Erhaltene Daten:');
    console.log('   Produkte:', requestItems);
    console.log('   Versandkosten:', requestShipping);
    
    // Bestellnummer generieren - Datum Format
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `AK-${month}${day}${year}-${random}`;
    
    // Validierung
    if (!requestItems || !Array.isArray(requestItems) || requestItems.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keine Artikel im Warenkorb' })
      };
    }
    
    // Line Items erstellen - NUR ECHTE PRODUKTE
    const lineItems = requestItems.map(item => ({
      price_data: {
        currency: 'chf',
        product_data: {
          name: item.name || 'Unbekanntes Produkt',
          metadata: { 
            type: 'product' // Markierung für Zapier: nur echte Produkte
          }
        },
        unit_amount: Math.round((item.price || 0) * 100)
      },
      quantity: item.quantity || 1
    }));
    
    console.log(`📦 ${lineItems.length} Produkte erstellt`);
    
    // Versandkosten hinzufügen falls vom Frontend gesendet
    if (requestShipping && requestShipping.amount > 0) {
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: requestShipping.description || 'Versandkosten',
            metadata: { 
              type: 'shipping' // Markierung für Zapier: Versandkosten ausfiltern
            }
          },
          unit_amount: requestShipping.amount // Bereits in Rappen vom Frontend
        },
        quantity: 1
      });
      
      console.log(`🚛 Versandkosten hinzugefügt: ${requestShipping.description} - ${requestShipping.amount/100} CHF`);
    } else {
      // Fallback: Minimale Versandkosten falls nichts vom Frontend kommt
      const fallbackShipping = 0.50; // CHF 0.50 MINIMAL für Stripe-Limit
      lineItems.push({
        price_data: {
          currency: 'chf',
          product_data: {
            name: 'Versandkosten',
            metadata: { 
              type: 'shipping' // Markierung für Zapier: ausfiltern
            }
          },
          unit_amount: Math.round(fallbackShipping * 100)
        },
        quantity: 1
      });
      
      console.log(`🚛 Fallback Versandkosten hinzugefügt: CHF ${fallbackShipping}`);
    }
    
    // Gesamtsumme für Logging
    const totalAmount = lineItems.reduce((sum, item) => 
      sum + (item.price_data.unit_amount * item.quantity), 0
    );
    console.log(`💰 Gesamtsumme: CHF ${totalAmount/100}`);
    
    // Stripe Checkout Session erstellen - TWINT zuerst für Schweizer Kunden
    const session = await stripe.checkout.sessions.create({
      payment_method_types: [
        'twint',          // TWINT zuerst (beliebteste in der Schweiz) 🇨🇭
        'card',           // Kreditkarten
        'paypal',         // PayPal  
        'klarna',         // Klarna (Buy now, pay later)
        'billie'          // Billie (B2B Payment)
      ],
      line_items: lineItems,
      mode: 'payment',
      client_reference_id: orderNumber,
      // INTELLIGENTE URLs basierend auf Test/Live
      success_url: isTest 
        ? `https://aesthetikoase.webflow.io/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`
        : `https://xn--sthetikoase-k8a.ch/bestellung-erfolgreich?session_id={CHECKOUT_SESSION_ID}&order=${orderNumber}`,
      cancel_url: isTest 
        ? `https://aesthetikoase.webflow.io/checkout?cancelled=true&reason=user_cancel`
        : `https://xn--sthetikoase-k8a.ch/checkout?cancelled=true&reason=user_cancel`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT']
      },
      // Kürzere Session-Dauer (das funktioniert)
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 Minuten
      custom_text: {
        shipping_address: {
          message: 'Bitte geben Sie Ihre Lieferadresse ein:'
        }
      },
      metadata: {
        order_number: orderNumber,
        product_count: requestItems.length,
        has_shipping: requestShipping ? 'yes' : 'no',
        environment: isTest ? 'test' : 'production',
        origin_domain: origin
      }
    });
    
    console.log(`✅ Stripe Session erstellt: ${session.id}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
        session_id: session.id,
        order_number: orderNumber
      })
    };
    
  } catch (error) {
    console.error('❌ Stripe Fehler:', error);
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
