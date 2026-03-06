import { AutoReplyService } from './services/autoReplyService.js';

async function run() {
    const text = 'hello';
    const keyword = 'hello';

    console.log('Fuzzy exact:', AutoReplyService.fuzzyContains(text, keyword));
    console.log('Fuzzy typo:', AutoReplyService.fuzzyContains('helo', 'hello'));

    // Test matchType exact
    const contentLower = text.toLowerCase().trim();
    console.log('Exact:', contentLower === keyword.toLowerCase() || AutoReplyService.normalizeText(contentLower) === AutoReplyService.normalizeText(keyword));
}

run();
