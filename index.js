app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `你說的是：${event.message.text}`,
      });
    }
    return Promise.resolve(null);
  }))
  .then(() => res.status(200).end())
  .catch((err) => {
    console.error(err);
    res.status(500).end();
  });
});
