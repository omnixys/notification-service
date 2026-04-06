# TODO

## Whatsapp Status via ws (QR erscheint live im UI)

 ticket "bau whatsapp subscription"
z.b: 

```
this.pubSub.publish('whatsapp.status', {
  state: this.state,
  qr: this.getQrCodeUrl(),
});

@Subscription(() => WhatsAppStatus)
whatsappStatus() {
  return this.pubSub.asyncIterator('whatsapp.status');
}
```

## Dockerfile

RUN apt-get update && apt-get install -y chromium


executablePath: '/usr/bin/chromium'


### im Payload fehlt
````
        renderedTitle
        renderedBody
        linkUrl
        read
```