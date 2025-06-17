<!-- Einfache Version für Webflow - NUR Bestellnummer -->

<!-- HTML in Webflow -->
<div class="order-confirmation">
  <h1>Herzlichen Dank für Ihre Bestellung!</h1>
  <p>Ihre Bestellnummer lautet: <strong id="order-number">Wird geladen...</strong></p>
  <p>Sie erhalten in Kürze eine Bestätigungs-E-Mail mit allen Details.</p>
</div>

<!-- JavaScript - NUR URL Parameter, KEIN API Call -->
<script>
(function() {
  // URL Parameter auslesen
  const urlParams = new URLSearchParams(window.location.search);
  const orderNumber = urlParams.get('order');
  
  // Bestellnummer sofort anzeigen
  if (orderNumber) {
    const orderElement = document.getElementById('order-number');
    if (orderElement) {
      orderElement.textContent = orderNumber;
    }
  } else {
    const orderElement = document.getElementById('order-number');
    if (orderElement) {
      orderElement.textContent = 'Nicht verfügbar';
    }
  }
})();
</script>
