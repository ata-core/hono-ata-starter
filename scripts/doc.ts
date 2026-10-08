import app from '../src/index.ts'
const res = await app.request('http://localhost/openapi.json')
console.log(JSON.stringify(await res.json(), null, 2))
