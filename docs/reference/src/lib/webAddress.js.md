---

# webAddress.js

Source: [`src/lib/webAddress.js`](../../../../src/lib/webAddress.js)

Which web addresses the assistant and the agents may open: `isPrivateHost(hostname)` (localhost, `.local`, `.internal`, loopback and private-network addresses) and `publicWebAddress(value)`, which returns the address as a `URL` only if it is a public http or https page and otherwise throws an error that the model understands. Used by the browser tools of [aiTools.js](aiTools.js.md) and by [webReferences.js](webReferences.js.md).
