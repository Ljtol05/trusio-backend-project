Configuring the SDK
API keys and clients
By default the SDK reads the OPENAI_API_KEY environment variable when first imported. If setting the variable is not possible you can call setDefaultOpenAIKey() manually.

Set default OpenAI key
import { setDefaultOpenAIKey } from '@openai/agents';

setDefaultOpenAIKey(process.env.OPENAI_API_KEY!); // sk-...

You may also pass your own OpenAI client instance. The SDK will otherwise create one automatically using the default key.

Set default OpenAI client
import { OpenAI } from 'openai';
import { setDefaultOpenAIClient } from '@openai/agents';

const customClient = new OpenAI({ baseURL: '...', apiKey: '...' });
setDefaultOpenAIClient(customClient);

Finally you can switch between the Responses API and the Chat Completions API.

Set OpenAI API
import { setOpenAIAPI } from '@openai/agents';

setOpenAIAPI('chat_completions');

Tracing
Tracing is enabled by default and uses the OpenAI key from the section above. A separate key may be set via setTracingExportApiKey().

Set tracing export API key
import { setTracingExportApiKey } from '@openai/agents';

setTracingExportApiKey('sk-...');

Tracing can also be disabled entirely.

Disable tracing
import { setTracingDisabled } from '@openai/agents';

setTracingDisabled(true);

Debug logging
The SDK uses the debug package for debug logging. Set the DEBUG environment variable to openai-agents* to see verbose logs.

Terminal window
export DEBUG=openai-agents*

You can obtain a namespaced logger for your own modules using getLogger(namespace) from @openai/agents.

Get logger
import { getLogger } from '@openai/agents';

const logger = getLogger('my-app');
logger.debug('something happened');

Sensitive data in logs
Certain logs may contain user data. Disable them by setting these environment variables.

To disable logging LLM inputs and outputs:

Terminal window
export OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1

To disable logging tool inputs and outputs:

Terminal window
export OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1