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

    // Request Body parsen
    const { items } = JSON.parse(event.body || '{}');

    // Bestellnummer generieren - Datum Format
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `AK-${month}${day}${year}-${random}`;

    // Versandkosten berechnen
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = subtotal >= 150 ? 0 : 9.90; // CHF 9.90 Versand (LIVE)

    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
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
            name: 'Versandkosten'
          },
          unit_amount: Math.round(shippingCost * 100)
        },
        quantity: 1
      });
    }

    // Stripe Checkout Session erstellen - MINIMAL für Geschwindigkeit
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
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['CH', 'DE', 'AT']
      },
      custom_text: {
        shipping_address: {
          message: 'Bitte geben Sie Ihre Lieferadresse ein:'
        }
      },
      metadata: {
        order_number: orderNumber
      }
    });

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
