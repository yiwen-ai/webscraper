# webscraper

## Setup tiptap Pro
https://tiptap.dev/registry

## API
### GET /scraping?url=targetUrl

Request:
```
GET http://127.0.0.1:8080/scraping?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Felu0e-EdVkbdp3W68R7zLQ
Accept: application/json
```

Response:
```json
{
  "readyAfter": 2,
  "result": {
    "id": "Dqb_kiwfNssNZYJRYNpY5L4EbBEAAAAAZKy9RA",
    "url": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ"
  }
}
```

### GET /document?url=targetUrl&output=basic

Request:
```
GET http://127.0.0.1:8080/document?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Felu0e-EdVkbdp3W68R7zLQ&output=basic
Accept: application/json
```

Response:
```json
{
  "result": {
    "id": "Dqb_kiwfNssNZYJRYNpY5L4EbBEAAAAAZKy9RA",
    "url": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
    "doc": {
      "url": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
      "src": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
      "title": "30年前的今天，黄家驹走了",
      "meta": {}
    }
  }
}
```

### GET /document?id=documentId&output=full

Request:
```
GET http://127.0.0.1:8080/document?id=Dqb_kiwfNssNZYJRYNpY5L4EbBEAAAAAZKy9RA&output=full
Accept: application/json
```

Response:
```json
{
  "result": {
    "id": "Dqb_kiwfNssNZYJRYNpY5L4EbBEAAAAAZKy9RA",
    "url": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
    "doc": {
      "url": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
      "src": "https://mp.weixin.qq.com/s/elu0e-EdVkbdp3W68R7zLQ",
      "title": "30年前的今天，黄家驹走了",
      "meta": {},
      "cbor": "xxxxx",
      "html": "xxxxxx",
      "page": "xxxxxx"
    }
  }
}
```