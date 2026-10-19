// Run from the project root: node scripts/check-rag-setup.mjs
// Lists Claude models and Chroma collections. No generation or database writes.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

let local = {};
try {
    local = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
    console.log('CONFIG: .env.local loaded.');
} catch (error) {
    if (error.code === 'ENOENT') {
        console.log('CONFIG: .env.local not found; using process environment.');
    } else {
        console.error('FAIL [ENV_FILE]: Could not read or parse .env.local.');
        process.exit(1);
    }
}
const env = { ...process.env, ...local };

function required(name) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`[ENV_MISSING] ${name} is empty.`);
    if (/[\r\n]/.test(value)) {
        throw new Error(`[ENV_FORMAT] ${name} must be a single-line value.`);
    }
    if (name.endsWith('API_KEY') && /[\s'",]|YOUR_API_KEY|your-key/i.test(value)) {
        throw new Error(`[ENV_FORMAT] ${name} must contain only the actual key.`);
    }
    return value;
}

async function getJson(url, headers) {
    let response;
    let body;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json', ...headers },
            signal: AbortSignal.timeout(30000),
            redirect: 'error',
        });
        body = await response.text();
    } catch (error) {
        const code = String(error.cause?.code || error.code || '');
        if (error.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') {
            throw new Error('[TIMEOUT] Request timed out. Check network connectivity.');
        }
        if (/CERT|ISSUER|VERIFY|SELF_SIGNED/.test(code)) {
            throw new Error('[TLS] HTTPS certificate verification failed.');
        }
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
            throw new Error('[DNS] The API hostname could not be resolved.');
        }
        throw new Error('[NETWORK] HTTPS request failed. Check connectivity or proxy settings.');
    }

    if (!response.ok) {
        const hints = {
            400: 'Request rejected. Check the account and API settings.',
            401: 'The API did not accept the supplied key.',
            402: 'Check API billing or available credits.',
            403: 'This key or network does not have the required access.',
            404: 'The endpoint or requested database was not found.',
            429: 'Rate limit or usage limit reached. Check the provider dashboard.',
            529: 'The provider is overloaded. Try again later.',
        };
        throw new Error(`[HTTP_${response.status}] ${hints[response.status] || 'API request failed.'}`);
    }

    try {
        return JSON.parse(body);
    } catch {
        throw new Error('[RESPONSE_FORMAT] The API did not return valid JSON.');
    }
}

let failures = 0;
console.log('\nCHECK: Claude API model listing...');
try {
    const result = await getJson('https://api.anthropic.com/v1/models?limit=1000', {
        'x-api-key': required('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
    });
    if (!Array.isArray(result.data) || result.data.some((model) => typeof model?.id !== 'string')) {
        throw new Error('[RESPONSE_FORMAT] Claude did not return the expected model list.');
    }
    if (result.data.length === 0) {
        throw new Error('[NO_MODELS] The key was accepted but no models were listed.');
    }

    console.log(`PASS: Claude returned ${result.data.length} model entries on this page.`);
    console.log('MODEL IDS (listing only; generation is not yet tested):');
    for (const model of result.data) {
        const status = typeof model.lifecycle === 'string' ? ` [${model.lifecycle}]` : '';
        console.log(`  ${JSON.stringify(model.id)}${status}`);
    }
    if (result.has_more) console.log('NOTE: More models are available beyond this page.');
} catch (error) {
    failures += 1;
    console.error(`FAIL CLAUDE: ${error.message}`);
}

console.log('\nCHECK: Chroma Cloud collection listing...');
try {
    const key = required('CHROMA_API_KEY');
    const tenant = encodeURIComponent(required('CHROMA_TENANT'));
    const database = encodeURIComponent(required('CHROMA_DATABASE'));
    const url = `https://api.trychroma.com/api/v2/tenants/${tenant}/databases/${database}/collections?limit=10&offset=0`;
    const collections = await getJson(url, { 'x-chroma-token': key });
    if (!Array.isArray(collections)) {
        throw new Error('[RESPONSE_FORMAT] Chroma did not return a collection list.');
    }

    console.log('PASS: Chroma key can access the configured tenant and database.');
    console.log(`Collections returned on the first page: ${collections.length}`);
    if (collections.length === 0) {
        console.log('NOTE: Empty is expected before indexing. Vector retrieval is not yet tested.');
    } else {
        for (const collection of collections) {
            if (typeof collection?.name === 'string') {
                console.log(`  ${JSON.stringify(collection.name)}`);
            }
        }
    }
} catch (error) {
    failures += 1;
    console.error(`FAIL CHROMA: ${error.message}`);
}

console.log('\nOnly GET requests were made. No generation, embeddings, or data writes.');
if (failures) {
    console.error(`SETUP CHECK FAILED: ${failures} service check(s) need attention.`);
    process.exitCode = 1;
} else {
    console.log('SETUP CHECK PASSED. Next: test actual generation and embeddings, then index knowledge.');
}