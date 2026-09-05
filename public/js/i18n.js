(function (g) {
  const STORAGE_KEY = '3nitylab.lang';
  const CITY_EL = {
    Nicosia: 'Λευκωσία',
    Limassol: 'Λεμεσός',
    Larnaca: 'Λάρνακα',
    Paphos: 'Πάφος',
    Ammochostos: 'Αμμόχωστος',
    Polis: 'Πόλις',
  };

  const STRINGS = {
    en: {
      'page.home': '3nityLab - 3D Printed Products Made in Cyprus',
      'page.product': 'Product - 3nityLab',
      'page.cart': 'Cart - 3nityLab',
      'page.checkout': 'Checkout - 3nityLab',
      'page.login': 'Login - 3nityLab',
      'page.account': 'Account - 3nityLab',
      'page.orderConfirm': 'Order Confirmed - 3nityLab',
      'page.checkoutCancel': 'Checkout cancelled - 3nityLab',
      'nav.home': 'Home',
      'nav.cart': 'Cart',
      'nav.login': 'Login',
      'nav.manage': 'Manage',
      'nav.account': 'Account',
      'nav.logout': 'Logout',
      'search.placeholder': 'Search our range of ready-made prints or request something new.',
      'search.button': 'Search',
      'search.suggestions': 'Search suggestions',
      'search.noMatches': 'No matches for “{query}”',
      'home.categories': 'Products Categories',
      'home.allProducts': 'All Products',
      'home.allProductsLabel': 'All products',
      'home.backToCategories': 'Back to categories',
      'home.products': 'Products',
      'home.prevCategories': 'Previous categories',
      'home.nextCategories': 'Next categories',
      'home.noCategories': 'No categories',
      'home.noProducts': 'No products match your search.',
      'home.loadFailed': 'Failed to load products. Make sure the server is running.',
      'home.footer': '© 3nityLab. All rights reserved.',
      'pagination.pageOf': 'Page {page} of {total}',
      'pagination.goTo': 'Go to',
      'pagination.go': 'Go',
      'pagination.first': 'First',
      'pagination.prev': 'Prev',
      'pagination.next': 'Next',
      'pagination.last': 'Last',
      'pagination.goToPage': 'Go to page',
      'product.addToCart': 'Add to cart',
      'product.addToCartBtn': 'Add to Cart',
      'product.added': 'Added ✓',
      'product.offer': 'Offer',
      'product.specialOffer': 'Special offer',
      'product.noDescription': 'No description.',
      'product.notFound': 'Product not found',
      'product.loadFailed': 'Failed to load product.',
      'product.quantity': 'Quantity',
      'product.color': 'Color',
      'product.size': 'Size',
      'product.select': 'Select…',
      'product.notSpecified': 'Not specified',
      'product.share': 'Share',
      'product.shareAria': 'Share product link',
      'product.back': '← Back',
      'product.bundleIncludes': 'This offer includes',
      'product.viewFullImage': 'View full size image',
      'product.notLoaded': 'Product not loaded yet',
      'product.linkCopied': 'Link copied',
      'product.shareFailed': 'Could not share link',
      'product.fallbackTitle': 'Product',
      'close': 'Close',
      'cancel': 'Cancel',
      'cart.addedOne': '{name} added to cart',
      'cart.addedMany': '{name} · {qty} added to cart',
      'cart.addedItems': '{qty} items added to cart',
      'cart.addedGeneric': 'Added to cart',
      'cart.viewCart': 'View cart',
      'cart.emptyTitle': 'Your cart is empty',
      'cart.emptyText': 'Add items from the store to see them here. When you’re ready, you can review color, size, and totals before checkout.',
      'cart.browse': 'Browse products',
      'cart.title': 'Shopping cart',
      'cart.subtitle': '{count} {items} · Review options and quantities below',
      'cart.item': 'item',
      'cart.items': 'items',
      'cart.continue': '← Continue shopping',
      'cart.itemsAria': 'Cart items',
      'cart.summary': 'Order summary',
      'cart.subtotal': 'Subtotal',
      'cart.tax': 'Estimated tax (VAT)',
      'cart.shipping': 'Shipping estimate',
      'cart.shippingFree': 'Free',
      'cart.freeDeliveryNote': 'Orders with more than 10 items get free delivery.',
      'cart.total': 'Total',
      'cart.note': 'Tax and shipping are estimates until checkout. Each line shows SKU and selected color/size for your order.',
      'cart.checkout': 'Proceed to checkout',
      'cart.secure': '🔒 Secure checkout',
      'cart.remove': 'Remove',
      'cart.removeAll': 'Clear Cart',
      'cart.removeAllConfirm': 'Clear all items from your cart?',
      'cart.removingAll': 'Clearing…',
      'cart.unitPrice': 'Unit price',
      'cart.lineTotal': 'Line total',
      'cart.qtyFor': 'Quantity for {title}',
      'cart.loadFailed': 'Could not load your cart.',
      'cart.returnHome': 'Return home',
      'session.expired': 'Your session has expired. Please log in again.',
      'request.title': 'Request a Custom Print',
      'request.product': 'Request a product',
      'request.defaultPrompt': 'Tell us what you need and we will email you back.',
      'request.name': 'Your name *',
      'request.email': 'Your email *',
      'request.message': 'Message',
      'request.messagePlaceholder': 'Describe your idea — size, colour, quantity, or attach a reference photo…',
      'request.photo': 'Attach a photo (optional)',
      'request.photoHint': 'JPEG, PNG, WebP or GIF. Max 5MB.',
      'request.send': 'Send request',
      'request.sending': 'Sending…',
      'request.success': 'Thank you! Your request was sent. We will get back to you soon.',
      'request.sendFailed': 'Could not send request',
      'login.title': 'Login',
      'login.email': 'Email',
      'login.password': 'Password',
      'login.submit': 'Login',
      'login.noAccount': 'Don\'t have an account?',
      'login.registerLink': 'Register',
      'register.title': 'Register',
      'register.firstName': 'First Name',
      'register.lastName': 'Last Name',
      'register.password': 'Password (min 8 characters)',
      'register.phone': 'Phone (optional)',
      'register.submit': 'Register',
      'register.hasAccount': 'Already have an account?',
      'register.loginLink': 'Login',
      'account.title': 'My Account',
      'account.orders': 'Order History',
      'account.name': 'Name:',
      'account.email': 'Email:',
      'account.phone': 'Phone:',
      'account.loadFailed': 'Failed to load profile.',
      'account.noOrders': 'No orders yet.',
      'account.orderCol': 'Order #',
      'account.statusCol': 'Status',
      'account.paymentCol': 'Payment',
      'account.totalCol': 'Total',
      'account.dateCol': 'Date',
      'account.onDelivery': 'On delivery ({status})',
      'account.ordersFailed': 'Failed to load orders.',
      'checkout.title': 'Checkout',
      'checkout.intro': 'Cyprus pickup only — choose an ACS, Akis Express, or Box Now location, then pay securely by card. Your order is created only after payment succeeds.',
      'checkout.pickupPayment': 'Pickup & payment',
      'checkout.email': 'Email *',
      'checkout.pickupCyprus': 'Pickup in Cyprus',
      'checkout.city': 'City *',
      'checkout.selectCity': 'Select a city',
      'checkout.noCities': 'No cities available',
      'checkout.courier': 'Courier',
      'checkout.providerAll': 'All',
      'checkout.searchCity': 'Search within city',
      'checkout.searchPlaceholder': 'Store name or address',
      'checkout.storesAria': 'Pickup stores',
      'checkout.chooseCity': 'Select your city to see available ACS, Akis Express, and Box Now pickup points.',
      'checkout.loadingPickup': 'Loading pickup locations…',
      'checkout.country': 'Country',
      'checkout.countryValue': 'Cyprus (CY)',
      'checkout.phone': 'Phone',
      'checkout.phoneOptional': '(optional)',
      'checkout.phoneHint': 'We’ll use this number if we need to reach you about your pickup.',
      'checkout.continuePay': 'Continue to payment',
      'checkout.payment': 'Payment',
      'checkout.paymentIntro': 'Enter your card below. Your order will be placed when payment succeeds.',
      'checkout.payNow': 'Pay now',
      'checkout.cancelReturn': 'Cancel and return to cart',
      'checkout.points': '{count} pickup point',
      'checkout.pointsPlural': '{count} pickup points',
      'checkout.noStores': 'No pickup points match this filter in the selected city.',
      'checkout.selectCityFirst': 'Please select a city first.',
      'checkout.selectStore': 'Please select a pickup store in your city.',
      'checkout.emptyCart': 'Your cart is empty. Add items before checkout.',
      'checkout.continueFailed': 'Could not continue to payment',
      'checkout.checkDetails': 'Please check your payment details',
      'checkout.paymentFailed': 'Payment failed',
      'checkout.paymentLoadFailed': 'Payment could not be loaded',
      'checkout.noCitiesAvailable': 'No Cyprus pickup cities are available yet. Please refresh in a moment.',
      'checkout.citiesLoadFailed': 'Could not load pickup cities. Please refresh the page.',
      'review.title': 'Order review',
      'review.empty': 'Your cart is empty.',
      'review.returnCart': 'Return to cart',
      'review.hint': 'SKU, color, and size match what will appear on your order.',
      'review.qty': 'Qty',
      'review.estTax': 'Est. tax (VAT)',
      'review.pickup': 'Pickup',
      'review.orderNumber': 'Order number',
      'review.assignedAfter': 'Assigned after payment',
      'review.amountDue': 'Amount due:',
      'order.confirmed': 'Order Confirmed!',
      'order.number': 'Order #{number}',
      'order.podNote': 'You chose pay on delivery. Please have payment ready when your order arrives.',
      'order.thanks': 'Thank you for your order. You will receive a confirmation email shortly.',
      'order.continue': 'Continue Shopping',
      'order.paymentFailed': 'Payment failed',
      'order.paymentFailedText': 'Your payment could not be completed. Please try again from your cart.',
      'order.backCart': 'Back to cart',
      'cancel.title': 'Checkout cancelled',
      'cancel.text': 'Your payment was not completed. Your cart is unchanged and no charge was made.',
      'cancel.continue': 'Continue shopping',
      'lang.label': 'Language',
      'lang.en': 'EN',
      'lang.el': 'EL',
    },
    el: {
      'page.home': '3nityLab - 3D εκτυπωμένα προϊόντα, κατασκευασμένα στην Κύπρο',
      'page.product': 'Προϊόν - 3nityLab',
      'page.cart': 'Καλάθι - 3nityLab',
      'page.checkout': 'Ολοκλήρωση αγοράς - 3nityLab',
      'page.login': 'Σύνδεση - 3nityLab',
      'page.account': 'Λογαριασμός - 3nityLab',
      'page.orderConfirm': 'Η παραγγελία επιβεβαιώθηκε - 3nityLab',
      'page.checkoutCancel': 'Η πληρωμή ακυρώθηκε - 3nityLab',
      'nav.home': 'Αρχική',
      'nav.cart': 'Καλάθι',
      'nav.login': 'Σύνδεση',
      'nav.manage': 'Διαχείριση',
      'nav.account': 'Λογαριασμός',
      'nav.logout': 'Αποσύνδεση',
      'search.placeholder': 'Αναζητήστε έτοιμες εκτυπώσεις ή ζητήστε κάτι νέο.',
      'search.button': 'Αναζήτηση',
      'search.suggestions': 'Προτάσεις αναζήτησης',
      'search.noMatches': 'Δεν βρέθηκαν αποτελέσματα για «{query}»',
      'home.categories': 'Κατηγορίες προϊόντων',
      'home.allProducts': 'Όλα τα προϊόντα',
      'home.allProductsLabel': 'Όλα τα προϊόντα',
      'home.backToCategories': 'Πίσω στις κατηγορίες',
      'home.products': 'Προϊόντα',
      'home.prevCategories': 'Προηγούμενες κατηγορίες',
      'home.nextCategories': 'Επόμενες κατηγορίες',
      'home.noCategories': 'Δεν υπάρχουν κατηγορίες',
      'home.noProducts': 'Κανένα προϊόν δεν ταιριάζει στην αναζήτησή σας.',
      'home.loadFailed': 'Αποτυχία φόρτωσης προϊόντων. Βεβαιωθείτε ότι ο διακομιστής λειτουργεί.',
      'home.footer': '© 3nityLab. Με επιφύλαξη παντός δικαιώματος.',
      'pagination.pageOf': 'Σελίδα {page} από {total}',
      'pagination.goTo': 'Μετάβαση',
      'pagination.go': 'OK',
      'pagination.first': 'Πρώτη',
      'pagination.prev': 'Προηγ.',
      'pagination.next': 'Επόμ.',
      'pagination.last': 'Τελευταία',
      'pagination.goToPage': 'Μετάβαση σε σελίδα',
      'product.addToCart': 'Προσθήκη στο καλάθι',
      'product.addToCartBtn': 'Προσθήκη στο καλάθι',
      'product.added': 'Προστέθηκε ✓',
      'product.offer': 'Προσφορά',
      'product.specialOffer': 'Ειδική προσφορά',
      'product.noDescription': 'Δεν υπάρχει περιγραφή.',
      'product.notFound': 'Το προϊόν δεν βρέθηκε',
      'product.loadFailed': 'Αποτυχία φόρτωσης προϊόντος.',
      'product.quantity': 'Ποσότητα',
      'product.color': 'Χρώμα',
      'product.size': 'Μέγεθος',
      'product.select': 'Επιλέξτε…',
      'product.notSpecified': 'Δεν καθορίστηκε',
      'product.share': 'Κοινοποίηση',
      'product.shareAria': 'Κοινοποίηση συνδέσμου προϊόντος',
      'product.back': '← Πίσω',
      'product.bundleIncludes': 'Η προσφορά περιλαμβάνει',
      'product.viewFullImage': 'Προβολή εικόνας σε πλήρες μέγεθος',
      'product.notLoaded': 'Το προϊόν δεν έχει φορτωθεί ακόμα',
      'product.linkCopied': 'Ο σύνδεσμος αντιγράφηκε',
      'product.shareFailed': 'Δεν ήταν δυνατή η κοινοποίηση',
      'product.fallbackTitle': 'Προϊόν',
      'close': 'Κλείσιμο',
      'cancel': 'Ακύρωση',
      'cart.addedOne': 'Το {name} προστέθηκε στο καλάθι',
      'cart.addedMany': '{name} · {qty} προστέθηκαν στο καλάθι',
      'cart.addedItems': '{qty} προϊόντα προστέθηκαν στο καλάθι',
      'cart.addedGeneric': 'Προστέθηκε στο καλάθι',
      'cart.viewCart': 'Προβολή καλαθιού',
      'cart.emptyTitle': 'Το καλάθι σας είναι άδειο',
      'cart.emptyText': 'Προσθέστε προϊόντα από το κατάστημα για να τα δείτε εδώ. Όταν είστε έτοιμοι, μπορείτε να ελέγξετε χρώμα, μέγεθος και σύνολα πριν την ολοκλήρωση.',
      'cart.browse': 'Περιήγηση προϊόντων',
      'cart.title': 'Καλάθι αγορών',
      'cart.subtitle': '{count} {items} · Ελέγξτε επιλογές και ποσότητες παρακάτω',
      'cart.item': 'προϊόν',
      'cart.items': 'προϊόντα',
      'cart.continue': '← Συνέχεια αγορών',
      'cart.itemsAria': 'Προϊόντα καλαθιού',
      'cart.summary': 'Σύνοψη παραγγελίας',
      'cart.subtotal': 'Υποσύνολο',
      'cart.tax': 'Εκτιμώμενος ΦΠΑ',
      'cart.shipping': 'Εκτίμηση αποστολής',
      'cart.shippingFree': 'Δωρεάν',
      'cart.freeDeliveryNote': 'Παραγγελίες με περισσότερα από 10 προϊόντα έχουν δωρεάν παράδοση.',
      'cart.total': 'Σύνολο',
      'cart.note': 'Ο ΦΠΑ και τα μεταφορικά οριστικοποιούνται στην ολοκλήρωση αγοράς. Κάθε γραμμή δείχνει SKU και επιλεγμένο χρώμα/μέγεθος.',
      'cart.checkout': 'Ολοκλήρωση αγοράς',
      'cart.secure': '🔒 Ασφαλής πληρωμή',
      'cart.remove': 'Αφαίρεση',
      'cart.removeAll': 'Εκκαθάριση καλαθιού',
      'cart.removeAllConfirm': 'Να αδειάσει το καλάθι από όλα τα προϊόντα;',
      'cart.removingAll': 'Εκκαθάριση…',
      'cart.unitPrice': 'Τιμή μονάδας',
      'cart.linePrice': 'Σύνολο γραμμής',
      'cart.lineTotal': 'Σύνολο γραμμής',
      'cart.qtyFor': 'Ποσότητα για {title}',
      'cart.loadFailed': 'Δεν ήταν δυνατή η φόρτωση του καλαθιού.',
      'cart.returnHome': 'Επιστροφή στην αρχική',
      'session.expired': 'Η συνεδρία σας έληξε. Παρακαλώ συνδεθείτε ξανά.',
      'request.title': 'Ζητήστε προσαρμοσμένη εκτύπωση',
      'request.product': 'Ζητήστε ένα προϊόν',
      'request.defaultPrompt': 'Πείτε μας τι χρειάζεστε και θα επικοινωνήσουμε μαζί σας με email.',
      'request.name': 'Το όνομά σας *',
      'request.email': 'Το email σας *',
      'request.message': 'Μήνυμα',
      'request.messagePlaceholder': 'Περιγράψτε την ιδέα σας — μέγεθος, χρώμα, ποσότητα, ή επισυνάψτε φωτογραφία αναφοράς…',
      'request.photo': 'Επισύναψη φωτογραφίας (προαιρετικό)',
      'request.photoHint': 'JPEG, PNG, WebP ή GIF. Μέγιστο 5MB.',
      'request.send': 'Αποστολή αιτήματος',
      'request.sending': 'Αποστολή…',
      'request.success': 'Ευχαριστούμε! Το αίτημά σας στάλθηκε. Θα επικοινωνήσουμε μαζί σας σύντομα.',
      'request.sendFailed': 'Δεν ήταν δυνατή η αποστολή του αιτήματος',
      'login.title': 'Σύνδεση',
      'login.email': 'Email',
      'login.password': 'Κωδικός',
      'login.submit': 'Σύνδεση',
      'login.noAccount': 'Δεν έχετε λογαριασμό;',
      'login.registerLink': 'Εγγραφή',
      'register.title': 'Εγγραφή',
      'register.firstName': 'Όνομα',
      'register.lastName': 'Επώνυμο',
      'register.password': 'Κωδικός (τουλάχιστον 8 χαρακτήρες)',
      'register.phone': 'Τηλέφωνο (προαιρετικό)',
      'register.submit': 'Εγγραφή',
      'register.hasAccount': 'Έχετε ήδη λογαριασμό;',
      'register.loginLink': 'Σύνδεση',
      'account.title': 'Ο λογαριασμός μου',
      'account.orders': 'Ιστορικό παραγγελιών',
      'account.name': 'Όνομα:',
      'account.email': 'Email:',
      'account.phone': 'Τηλέφωνο:',
      'account.loadFailed': 'Αποτυχία φόρτωσης προφίλ.',
      'account.noOrders': 'Δεν υπάρχουν παραγγελίες ακόμα.',
      'account.orderCol': 'Παραγγελία #',
      'account.statusCol': 'Κατάσταση',
      'account.paymentCol': 'Πληρωμή',
      'account.totalCol': 'Σύνολο',
      'account.dateCol': 'Ημερομηνία',
      'account.onDelivery': 'Με αντικαταβολή ({status})',
      'account.ordersFailed': 'Αποτυχία φόρτωσης παραγγελιών.',
      'checkout.title': 'Ολοκλήρωση αγοράς',
      'checkout.intro': 'Παραλαβή μόνο στην Κύπρο — επιλέξτε σημείο ACS, Akis Express ή Box Now και πληρώστε με κάρτα. Η παραγγελία δημιουργείται μόνο μετά την επιτυχή πληρωμή.',
      'checkout.pickupPayment': 'Παραλαβή & πληρωμή',
      'checkout.email': 'Email *',
      'checkout.pickupCyprus': 'Παραλαβή στην Κύπρο',
      'checkout.city': 'Πόλη *',
      'checkout.selectCity': 'Επιλέξτε πόλη',
      'checkout.noCities': 'Δεν υπάρχουν διαθέσιμες πόλεις',
      'checkout.courier': 'Μεταφορέας',
      'checkout.providerAll': 'Όλα',
      'checkout.searchCity': 'Αναζήτηση στην πόλη',
      'checkout.searchPlaceholder': 'Όνομα καταστήματος ή διεύθυνση',
      'checkout.storesAria': 'Σημεία παραλαβής',
      'checkout.chooseCity': 'Επιλέξτε πόλη για να δείτε τα διαθέσιμα σημεία ACS, Akis Express και Box Now.',
      'checkout.loadingPickup': 'Φόρτωση σημείων παραλαβής…',
      'checkout.country': 'Χώρα',
      'checkout.countryValue': 'Κύπρος (CY)',
      'checkout.phone': 'Τηλέφωνο',
      'checkout.phoneOptional': '(προαιρετικό)',
      'checkout.phoneHint': 'Θα χρησιμοποιήσουμε αυτό τον αριθμό αν χρειαστεί να επικοινωνήσουμε μαζί σας για την παραλαβή.',
      'checkout.continuePay': 'Συνέχεια στην πληρωμή',
      'checkout.payment': 'Πληρωμή',
      'checkout.paymentIntro': 'Εισάγετε τα στοιχεία της κάρτας σας. Η παραγγελία θα ολοκληρωθεί όταν επιτύχει η πληρωμή.',
      'checkout.payNow': 'Πληρωμή τώρα',
      'checkout.cancelReturn': 'Ακύρωση και επιστροφή στο καλάθι',
      'checkout.points': '{count} σημείο παραλαβής',
      'checkout.pointsPlural': '{count} σημεία παραλαβής',
      'checkout.noStores': 'Δεν υπάρχουν σημεία παραλαβής με αυτό το φίλτρο στην επιλεγμένη πόλη.',
      'checkout.selectCityFirst': 'Παρακαλώ επιλέξτε πρώτα πόλη.',
      'checkout.selectStore': 'Παρακαλώ επιλέξτε σημείο παραλαβής στην πόλη σας.',
      'checkout.emptyCart': 'Το καλάθι σας είναι άδειο. Προσθέστε προϊόντα πριν την ολοκλήρωση.',
      'checkout.continueFailed': 'Δεν ήταν δυνατή η συνέχεια στην πληρωμή',
      'checkout.checkDetails': 'Ελέγξτε τα στοιχεία πληρωμής',
      'checkout.paymentFailed': 'Η πληρωμή απέτυχε',
      'checkout.paymentLoadFailed': 'Δεν ήταν δυνατή η φόρτωση της πληρωμής',
      'checkout.noCitiesAvailable': 'Δεν υπάρχουν ακόμα διαθέσιμες πόλεις παραλαβής στην Κύπρο. Ανανεώστε σε λίγο.',
      'checkout.citiesLoadFailed': 'Δεν ήταν δυνατή η φόρτωση των πόλεων. Ανανεώστε τη σελίδα.',
      'review.title': 'Ανασκόπηση παραγγελίας',
      'review.empty': 'Το καλάθι σας είναι άδειο.',
      'review.returnCart': 'Επιστροφή στο καλάθι',
      'review.hint': 'SKU, χρώμα και μέγεθος είναι αυτά που θα εμφανιστούν στην παραγγελία σας.',
      'review.qty': 'Ποσ.',
      'review.estTax': 'Εκτ. ΦΠΑ',
      'review.pickup': 'Παραλαβή',
      'review.orderNumber': 'Αριθμός παραγγελίας',
      'review.assignedAfter': 'Ορίζεται μετά την πληρωμή',
      'review.amountDue': 'Ποσό πληρωμής:',
      'order.confirmed': 'Η παραγγελία επιβεβαιώθηκε!',
      'order.number': 'Παραγγελία #{number}',
      'order.podNote': 'Επιλέξατε πληρωμή κατά την παράδοση. Έχετε τα χρήματα έτοιμα όταν φτάσει η παραγγελία.',
      'order.thanks': 'Ευχαριστούμε για την παραγγελία σας. Θα λάβετε σύντομα email επιβεβαίωσης.',
      'order.continue': 'Συνέχεια αγορών',
      'order.paymentFailed': 'Η πληρωμή απέτυχε',
      'order.paymentFailedText': 'Η πληρωμή δεν ολοκληρώθηκε. Δοκιμάστε ξανά από το καλάθι σας.',
      'order.backCart': 'Επιστροφή στο καλάθι',
      'cancel.title': 'Η πληρωμή ακυρώθηκε',
      'cancel.text': 'Η πληρωμή δεν ολοκληρώθηκε. Το καλάθι σας δεν άλλαξε και δεν έγινε χρέωση.',
      'cancel.continue': 'Συνέχεια αγορών',
      'lang.label': 'Γλώσσα',
      'lang.en': 'EN',
      'lang.el': 'ΕΛ',
    },
  };

  function detectLang() {
    try {
      const stored = g.localStorage && g.localStorage.getItem(STORAGE_KEY);
      if (stored === 'el' || stored === 'en') return stored;
    } catch (_) {}
    const nav = String((g.navigator && (g.navigator.language || g.navigator.userLanguage)) || '').toLowerCase();
    if (nav.startsWith('el')) return 'el';
    return 'en';
  }

  let currentLang = detectLang();

  function getStoreLang() {
    return currentLang === 'el' ? 'el' : 'en';
  }

  function t(key, vars) {
    const lang = getStoreLang();
    let s = (STRINGS[lang] && STRINGS[lang][key]) || (STRINGS.en && STRINGS.en[key]) || key;
    if (vars && typeof vars === 'object') {
      s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
    }
    return s;
  }

  function localizedField(obj, field) {
    if (!obj) return '';
    const en = obj[field];
    const el = obj[field + '_el'];
    const enText = en != null ? String(en) : '';
    const elText = el != null ? String(el) : '';
    if (getStoreLang() === 'el') return elText.trim() !== '' ? elText : enText;
    return enText.trim() !== '' ? enText : elText;
  }

  function localizedCity(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (getStoreLang() !== 'el') return raw;
    return CITY_EL[raw] || raw;
  }

  function applyStaticTranslations() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getStoreLang() === 'el' ? 'el' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    });
    document.querySelectorAll('title[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) document.title = t(key);
    });
    syncSwitcher();
  }

  function syncSwitcher() {
    document.querySelectorAll('.lang-switch [data-lang]').forEach((btn) => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('is-active', lang === getStoreLang());
      btn.setAttribute('aria-pressed', lang === getStoreLang() ? 'true' : 'false');
    });
  }

  function injectSwitcher() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.nav').forEach((nav) => {
      if (nav.querySelector('.lang-switch')) return;
      if (nav.closest('.admin-layout')) return;
      const wrap = document.createElement('div');
      wrap.className = 'lang-switch';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', t('lang.label'));
      wrap.innerHTML =
        '<button type="button" class="lang-switch__btn" data-lang="en" aria-pressed="false">EN</button>' +
        '<button type="button" class="lang-switch__btn" data-lang="el" aria-pressed="false">ΕΛ</button>';
      nav.insertBefore(wrap, nav.firstChild);
      wrap.querySelectorAll('[data-lang]').forEach((btn) => {
        btn.addEventListener('click', () => setStoreLang(btn.getAttribute('data-lang')));
      });
    });
    syncSwitcher();
  }

  function setStoreLang(lang) {
    const next = lang === 'el' ? 'el' : 'en';
    if (next === currentLang) return;
    currentLang = next;
    try {
      g.localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}
    applyStaticTranslations();
    injectSwitcher();
    if (typeof g.dispatchEvent === 'function') {
      g.dispatchEvent(new CustomEvent('storelangchange', { detail: { lang: next } }));
    }
  }

  g.t = t;
  g.getStoreLang = getStoreLang;
  g.setStoreLang = setStoreLang;
  g.localizedField = localizedField;
  g.localizedCity = localizedCity;
  g.applyStaticTranslations = applyStaticTranslations;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = getStoreLang() === 'el' ? 'el' : 'en';
    const boot = () => {
      injectSwitcher();
      applyStaticTranslations();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
