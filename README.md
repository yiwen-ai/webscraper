# webscraper

## Setup tiptap Pro
https://tiptap.dev/registry

## API
### GET /scraping?url=targetUrl

Request:
```
GET http://127.0.0.1:8080/v1/scraping?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Felu0e-EdVkbdp3W68R7zLQ
Accept: application/json
```

Response:
```json
{
  "retry": 2,
  "result": {
    "id": "cirvsm8isneqlujq68p0",
    "url": "https://mp.weixin.qq.com/s/6iCpGzsqnXcGZPoEhqJE4Q"
  }
}
```

### GET /document?id=xid&output=full

Request:
```
GET http://127.0.0.1:8080/document?id=cirvsm8isneqlujq68p0&output=full
Accept: application/json
```

Response:
```json
{
  "result": {
    "id": "cirvsm8isneqlujq68p0",
    "url": "https://mp.weixin.qq.com/s/6iCpGzsqnXcGZPoEhqJE4Q",
    "src": "https://mp.weixin.qq.com/s/6iCpGzsqnXcGZPoEhqJE4Q",
    "title": "网络平台提供代币充值服务合规要点——以抖音抖币充值为例",
    "meta": {...},
    "cbor": Buffer,
    "html": "xxxxxx",
    "page": "xxxxxx"
  }
}
```