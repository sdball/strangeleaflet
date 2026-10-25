---
title: Getting AlpineJS to work with Phoenix 1.7
slug: getting-alpinejs-to-work-with-phoenix-17
published_date: 2022-11-24T05:00:00+00:00
tags: alpinejs, elixir, phoenix
publish: true
---

I wanted to follow along with the very excellent blog post [Autocomplete Search Component with Phoenix LiveView and AlpineJS](https://medium.com/mindvalley-technology/autocomplete-search-component-with-phoenix-liveview-and-alpinejs-4a98b7287b9f) but translate it to Phoenix 1.7.

The changes were mostly straightforward (e.g. using HEEx templates instead of LEEx) but adding AlpineJS proved to be different than in almost all the references I found online so I figured I'd capture what I did here.

```
playground $ cd assets
playground $ npm install alpinejs
```

Edit `assets/js/app.js` and add these lines

```javascript
import Alpine from "alpinejs";
window.Alpine = Alpine;
Alpine.start();
```

And change the `live_socket` function to clone AlpineJS in live views so it can keep up with the DOM

```javascript
let liveSocket = new LiveSocket("/live", Socket, {
  dom: {
    // make LiveView work nicely with AlpineJS
    onBeforeElUpdated(from, to) {
      if (from._x_dataStack) {
        window.Alpine.clone(from, to);
      }
    },
  },
  params: { _csrf_token: csrfToken },
});
```

With that all of my AlpineJS test elements started working as expected, whew!

e.g.

```html
<h1 x-data="{ message: 'I ❤️ Alpine' }" x-text="message"></h1>
```

```html
<div x-data="{ isShowing: false }">
  <p x-show="isShowing">Shows when <code>isShowing</code> is true</p>
  <p x-show="!isShowing">Shows when <code>isShowing</code> is false</p>
  <p><code>isShowing: </code><code x-text="isShowing"></code></p>
</div>
```

Hooray!
