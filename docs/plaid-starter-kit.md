# Sandbox endpoints

#### API reference for Sandbox endpoints

=\*=\*=\*= [**Introduction**](https://plaid.com/docs/api/sandbox/#introduction)

Plaid's Sandbox environment provides a number of endpoints that can be used to configure testing scenarios. These endpoints are unique to the Sandbox environment and cannot be used in Production. For more information on these endpoints, see [Sandbox](https://plaid.com/docs/sandbox/).

| In this section |  |
| --- | --- |
| [`/sandbox/public_token/create`](https://plaid.com/docs/api/sandbox/#sandboxpublic_tokencreate) | Bypass the Link flow for creating an Item |
| [`/sandbox/processor_token/create`](https://plaid.com/docs/api/sandbox/#sandboxprocessor_tokencreate) | Bypass the Link flow for creating an Item for a processor partner |
| [`/sandbox/item/reset_login`](https://plaid.com/docs/api/sandbox/#sandboxitemreset_login) | Trigger the `ITEM_LOGIN_REQUIRED` state for an Item |
| [`/sandbox/user/reset_login`](https://plaid.com/docs/api/sandbox/#sandboxuserreset_login) | (Income and Check) Force Item(s) for a Sandbox user into an error state |
| [`/sandbox/item/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxitemfire_webhook) | Fire a specific webhook |
| [`/sandbox/item/set_verification_status`](https://plaid.com/docs/api/sandbox/#sandboxitemset_verification_status) | (Auth) Set a verification status for testing micro-deposits |
| [`/sandbox/transfer/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxtransferfire_webhook) | (Transfer) Fire a specific webhook |
| [`/sandbox/transfer/ledger/deposit/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerdepositsimulate) | (Transfer) Simulate a deposit sweep event |
| [`/sandbox/transfer/ledger/simulate_available`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgersimulate_available) | (Transfer) Simulate converting pending balance into available balance |
| [`/sandbox/transfer/ledger/withdraw/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerwithdrawsimulate) | (Transfer) Simulate a withdraw sweep event |
| [`/sandbox/transfer/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransfersimulate) | (Transfer) Simulate a transfer event |
| [`/sandbox/transfer/refund/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferrefundsimulate) | (Transfer) Simulate a refund event |
| [`/sandbox/transfer/sweep/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransfersweepsimulate) | (Transfer) Simulate a transfer sweep event |
| [`/sandbox/transfer/test_clock/create`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockcreate) | (Transfer) Create a test clock for testing recurring transfers |
| [`/sandbox/transfer/test_clock/advance`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockadvance) | (Transfer) Advance the time on a test clock |
| [`/sandbox/transfer/test_clock/get`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockget) | (Transfer) Get details about a test clock |
| [`/sandbox/transfer/test_clock/list`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clocklist) | (Transfer) Get details about all test clocks |
| [`/sandbox/income/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxincomefire_webhook) | (Income) Fire a specific webhook |
| [`/sandbox/cra/cashflow_updates/update`](https://plaid.com/docs/api/sandbox/#sandboxcracashflow_updatesupdate) | (Check) Simulate an update for Cash Flow Updates |
| [`/sandbox/payment/simulate`](https://plaid.com/docs/api/sandbox/#sandboxpaymentsimulate) | (Payment Initiation) Simulate a payment |
| [`/sandbox/transactions/create`](https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate) | (Transactions) Create custom transactions for Items |

=\*=\*=\*= [**`/sandbox/public_token/create`**](https://plaid.com/docs/api/sandbox/#sandboxpublic_tokencreate)

[**Create a test Item**](https://plaid.com/docs/api/sandbox/#create-a-test-item)

Use the [`/sandbox/public_token/create`](https://plaid.com/docs/api/sandbox/#sandboxpublic_tokencreate) endpoint to create a valid `public_token` for an arbitrary institution ID, initial products, and test credentials. The created `public_token` maps to a new Sandbox Item. You can then call [`/item/public_token/exchange`](https://plaid.com/docs/api/items/#itempublic_tokenexchange) to exchange the `public_token` for an `access_token` and perform all API actions. [`/sandbox/public_token/create`](https://plaid.com/docs/api/sandbox/#sandboxpublic_tokencreate) can also be used with the [`user_custom` test username](https://plaid.com/docs/sandbox/user-custom) to generate a test account with custom data, or with Plaid's [pre-populated Sandbox test accounts](https://plaid.com/docs/sandbox/test-credentials/).

sandbox/public\_token/create

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The ID of the institution the Item will be associated with

The products to initially pull for the Item. May be any products that the specified `institution_id` supports. This array may not be empty.

Min items: `1`

Possible values: `assets`, `auth`, `identity`, `income_verification`, `investments_auth`, `investments`, `liabilities`, `payment_initiation`, `signal`, `standing_orders`, `statements`, `transactions`, `transfer`

An optional set of options to be used when configuring the Item. If specified, must not be `null`.

Hide object

Specify a webhook to associate with the new Item.

Test username to use for the creation of the Sandbox Item. Default value is `user_good`.

Default: `user_good`

Test password to use for the creation of the Sandbox Item. Default value is `pass_good`.

Default: `pass_good`

An optional set of parameters corresponding to transactions options.

Hide object

The earliest date for which to fetch transaction history. Dates should be formatted as YYYY-MM-DD.

Format: `date`

The most recent date for which to fetch transaction history. Dates should be formatted as YYYY-MM-DD.

Format: `date`

An optional set of parameters corresponding to statements options.

Hide object

The earliest date for which to fetch statements history. Dates should be formatted as YYYY-MM-DD.

Format: `date`

The most recent date for which to fetch statements history. Dates should be formatted as YYYY-MM-DD.

Format: `date`

A set of parameters for income verification options. This field is required if `income_verification` is included in the `initial_products` array.

Hide object

The types of source income data that users will be permitted to share. Options include `bank` and `payroll`. Currently you can only specify one of these options.

Possible values: `bank`, `payroll`

Specifies options for Bank Income. This field is required if `income_verification` is included in the `initial_products` array and `bank` is specified in `income_source_types`.

Hide object

The number of days of data to request for the Bank Income product

The user token associated with the User data is being requested for.

Select group for content switcher

Current librariesLegacy libraries

/sandbox/public\_token/create

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const publicTokenRequest: SandboxPublicTokenCreateRequest = {
2  institution_id: institutionID,
3  initial_products: initialProducts,
4};
5try {
6  const publicTokenResponse = await client.sandboxPublicTokenCreate(
7    publicTokenRequest,
8  );
9  const publicToken = publicTokenResponse.data.public_token;
10  // The generated public_token can now be exchanged
11  // for an access_token
12  const exchangeRequest: ItemPublicTokenExchangeRequest = {
13    public_token: publicToken,
14  };
15  const exchangeTokenResponse = await client.itemPublicTokenExchange(
16    exchangeRequest,
17  );
18  const accessToken = exchangeTokenResponse.data.access_token;
19} catch (error) {
20  // handle error
21}
```

sandbox/public\_token/create

**Response fields** and example

A public token that can be exchanged for an access token using `/item/public_token/exchange`

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "public_token": "public-sandbox-b0e2c4ee-a763-4df5-bfe9-46a46bce993d",
3  "request_id": "Aim3b"
4}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/processor_token/create`**](https://plaid.com/docs/api/sandbox/#sandboxprocessor_tokencreate)

[**Create a test Item and processor token**](https://plaid.com/docs/api/sandbox/#create-a-test-item-and-processor-token)

Use the [`/sandbox/processor_token/create`](https://plaid.com/docs/api/sandbox/#sandboxprocessor_tokencreate) endpoint to create a valid `processor_token` for an arbitrary institution ID and test credentials. The created `processor_token` corresponds to a new Sandbox Item. You can then use this `processor_token` with the `/processor/` API endpoints in Sandbox. You can also use [`/sandbox/processor_token/create`](https://plaid.com/docs/api/sandbox/#sandboxprocessor_tokencreate) with the [`user_custom` test username](https://plaid.com/docs/sandbox/user-custom) to generate a test account with custom data.

sandbox/processor\_token/create

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The ID of the institution the Item will be associated with

An optional set of options to be used when configuring the Item. If specified, must not be `null`.

Hide object

Test username to use for the creation of the Sandbox Item. Default value is `user_good`.

Default: `user_good`

Test password to use for the creation of the Sandbox Item. Default value is `pass_good`.

Default: `pass_good`

Select group for content switcher

Current librariesLegacy libraries

/sandbox/processor\_token/create

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxProcessorTokenCreateRequest = {
2  institution_id: institutionID,
3};
4try {
5  const response = await plaidClient.sandboxProcessorTokenCreate(request);
6  const processorToken = response.data.processor_token;
7} catch (error) {
8  // handle error
9}
```

sandbox/processor\_token/create

**Response fields** and example

A processor token that can be used to call the `/processor/` endpoints.

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "processor_token": "processor-sandbox-b0e2c4ee-a763-4df5-bfe9-46a46bce993d",
3  "request_id": "Aim3b"
4}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/item/reset_login`**](https://plaid.com/docs/api/sandbox/#sandboxitemreset_login)

[**Force a Sandbox Item into an error state**](https://plaid.com/docs/api/sandbox/#force-a-sandbox-item-into-an-error-state)

`/sandbox/item/reset_login/` forces an Item into an `ITEM_LOGIN_REQUIRED` state in order to simulate an Item whose login is no longer valid. This makes it easy to test Link's [update mode](https://plaid.com/docs/link/update-mode) flow in the Sandbox environment. After calling [`/sandbox/item/reset_login`](https://plaid.com/docs/api/sandbox/#sandboxitemreset_login), You can then use Plaid Link update mode to restore the Item to a good state. An `ITEM_LOGIN_REQUIRED` webhook will also be fired after a call to this endpoint, if one is associated with the Item.

In the Sandbox, Items will transition to an `ITEM_LOGIN_REQUIRED` error state automatically after 30 days, even if this endpoint is not called.

sandbox/item/reset\_login

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The access token associated with the Item data is being requested for.

Select group for content switcher

Current librariesLegacy libraries

/sandbox/item/reset\_login

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxItemResetLoginRequest = {
2  access_token: accessToken,
3};
4try {
5  const response = await plaidClient.sandboxItemResetLogin(request);
6  // create a public_token for the Item and use it to
7  // initialize Link in update mode.
8  const pt_request: itemPublicTokenCreateRequest = {
9    access_token: accessToken,
10  };
11  const pt_response = await plaidClient.itemCreatePublicToken(pt_request);
12  const publicToken = pt_response.public_token;
13} catch (error) {
14  // handle error
15}
```

sandbox/item/reset\_login

**Response fields** and example

`true` if the call succeeded

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "reset_login": true,
3  "request_id": "m8MDnv9okwxFNBV"
4}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/user/reset_login`**](https://plaid.com/docs/api/sandbox/#sandboxuserreset_login)

[**Force item(s) for a Sandbox User into an error state**](https://plaid.com/docs/api/sandbox/#force-item(s)-for-a-sandbox-user-into-an-error-state)

`/sandbox/user/reset_login/` functions the same as [`/sandbox/item/reset_login`](https://plaid.com/docs/api/sandbox/#sandboxitemreset_login), but will modify Items related to a User. This endpoint forces each Item into an `ITEM_LOGIN_REQUIRED` state in order to simulate an Item whose login is no longer valid. This makes it easy to test Link's [update mode](https://plaid.com/docs/link/update-mode) flow in the Sandbox environment. After calling [`/sandbox/user/reset_login`](https://plaid.com/docs/api/sandbox/#sandboxuserreset_login), You can then use Plaid Link update mode to restore Items associated with the User to a good state. An `ITEM_LOGIN_REQUIRED` webhook will also be fired after a call to this endpoint, if one is associated with the Item.

In the Sandbox, Items will transition to an `ITEM_LOGIN_REQUIRED` error state automatically after 30 days, even if this endpoint is not called.

sandbox/user/reset\_login

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The user token associated with the User data is being requested for.

An array of `item_id` s associated with the User to be reset. If empty or `null`, this field will default to resetting all Items associated with the User.

/sandbox/user/reset\_login

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxUserResetLoginRequest = {
2  user_token: 'user-environment-1234567-abcd-abcd-1234-1234567890ab',
3  item_ids: ['eVBnVMp7zdTJLkRNr33Rs6zr7KNJqBFL9DrE6']
4};
5try {
6  const response = await plaidClient.sandboxUserResetLogin(request);
7} catch (error) {
8  // handle error
9}
```

sandbox/user/reset\_login

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "reset_login": true,
3  "request_id": "n7XQnv8ozwyFPBC"
4}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/item/fire_webhook`**](https://plaid.com/docs/api/sandbox/#sandboxitemfire_webhook)

[**Fire a test webhook**](https://plaid.com/docs/api/sandbox/#fire-a-test-webhook)

The [`/sandbox/item/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxitemfire_webhook) endpoint is used to test that code correctly handles webhooks. This endpoint can trigger the following webhooks:

`DEFAULT_UPDATE`: Webhook to be fired for a given Sandbox Item simulating a default update event for the respective product as specified with the `webhook_type` in the request body. Valid Sandbox `DEFAULT_UPDATE` webhook types include: `AUTH`, `IDENTITY`, `TRANSACTIONS`, `INVESTMENTS_TRANSACTIONS`, `LIABILITIES`, `HOLDINGS`. If the Item does not support the product, a `SANDBOX_PRODUCT_NOT_ENABLED` error will result.

`NEW_ACCOUNTS_AVAILABLE`: Fired to indicate that a new account is available on the Item and you can launch update mode to request access to it.

`SMS_MICRODEPOSITS_VERIFICATION`: Fired when a given same day micro-deposit item is verified via SMS verification.

`LOGIN_REPAIRED`: Fired when an Item recovers from the `ITEM_LOGIN_REQUIRED` without the user going through update mode in your app.

`PENDING_DISCONNECT`: Fired when an Item will stop working in the near future (e.g. due to a planned bank migration) and must be sent through update mode to continue working.

`RECURRING_TRANSACTIONS_UPDATE`: Recurring Transactions webhook to be fired for a given Sandbox Item. If the Item does not support Recurring Transactions, a `SANDBOX_PRODUCT_NOT_ENABLED` error will result.

`SYNC_UPDATES_AVAILABLE`: Transactions webhook to be fired for a given Sandbox Item. If the Item does not support Transactions, a `SANDBOX_PRODUCT_NOT_ENABLED` error will result.

`PRODUCT_READY`: Assets webhook to be fired when a given asset report has been successfully generated. If the Item does not support Assets, a `SANDBOX_PRODUCT_NOT_ENABLED` error will result.

`ERROR`: Assets webhook to be fired when asset report generation has failed. If the Item does not support Assets, a `SANDBOX_PRODUCT_NOT_ENABLED` error will result.

`USER_PERMISSION_REVOKED`: Indicates an end user has revoked the permission that they previously granted to access an Item. May not always fire upon revocation, as some institutions’ consent portals do not trigger this webhook. Upon receiving this webhook, it is recommended to delete any stored data from Plaid associated with the account or Item.

`USER_ACCOUNT_REVOKED`: Fired when an end user has revoked access to their account on the Data Provider's portal. This webhook is currently sent only for Chase and PNC Items, but may be sent in the future for other financial institutions. Upon receiving this webhook, it is recommended to delete any stored data from Plaid associated with the account or Item.

Note that this endpoint is provided for developer ease-of-use and is not required for testing webhooks; webhooks will also fire in Sandbox under the same conditions that they would in Production (except for webhooks of type `TRANSFER`).

sandbox/item/fire\_webhook

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The access token associated with the Item data is being requested for.

The webhook types that can be fired by this test endpoint.

Possible values: `AUTH`, `HOLDINGS`, `INVESTMENTS_TRANSACTIONS`, `ITEM`, `LIABILITIES`, `TRANSACTIONS`, `ASSETS`

The webhook codes that can be fired by this test endpoint.

Possible values: `DEFAULT_UPDATE`, `NEW_ACCOUNTS_AVAILABLE`, `SMS_MICRODEPOSITS_VERIFICATION`, `USER_PERMISSION_REVOKED`, `USER_ACCOUNT_REVOKED`, `PENDING_DISCONNECT`, `RECURRING_TRANSACTIONS_UPDATE`, `LOGIN_REPAIRED`, `SYNC_UPDATES_AVAILABLE`, `PRODUCT_READY`, `ERROR`

Select group for content switcher

Current librariesLegacy libraries

/sandbox/item/fire\_webhook

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1// Fire a DEFAULT_UPDATE webhook for an Item
2const request: SandboxItemFireWebhookRequest = {
3  access_token: accessToken
4  webhook_code: 'DEFAULT_UPDATE'
5};
6try {
7  const response = await plaidClient.sandboxItemFireWebhook(request);
8} catch (error) {
9  // handle error
10}
```

sandbox/item/fire\_webhook

**Response fields** and example

Value is `true` if the test ` webhook_code` was successfully fired.

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "webhook_fired": true,
3  "request_id": "1vwmF5TBQwiqfwP"
4}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/item/set_verification_status`**](https://plaid.com/docs/api/sandbox/#sandboxitemset_verification_status)

[**Set verification status for Sandbox account**](https://plaid.com/docs/api/sandbox/#set-verification-status-for-sandbox-account)

The [`/sandbox/item/set_verification_status`](https://plaid.com/docs/api/sandbox/#sandboxitemset_verification_status) endpoint can be used to change the verification status of an Item in in the Sandbox in order to simulate the Automated Micro-deposit flow.

For more information on testing Automated Micro-deposits in Sandbox, see [Auth full coverage testing](https://plaid.com/docs/auth/coverage/testing#).

sandbox/item/set\_verification\_status

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The access token associated with the Item data is being requested for.

The `account_id` of the account whose verification status is to be modified

The verification status to set the account to.

Possible values: `automatically_verified`, `verification_expired`

Select group for content switcher

Current librariesLegacy libraries

/sandbox/item/set\_verification\_status

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxItemSetVerificationStatusRequest = {
2  access_token: accessToken,
3  account_id: accountID,
4  verification_status: 'automatically_verified',
5};
6try {
7  const response = await plaidClient.sandboxItemSetVerificationStatus(request);
8} catch (error) {
9  // handle error
10}
```

sandbox/item/set\_verification\_status

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "1vwmF5TBQwiqfwP"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/fire_webhook`**](https://plaid.com/docs/api/sandbox/#sandboxtransferfire_webhook)

[**Manually fire a Transfer webhook**](https://plaid.com/docs/api/sandbox/#manually-fire-a-transfer-webhook)

Use the [`/sandbox/transfer/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxtransferfire_webhook) endpoint to manually trigger a `TRANSFER_EVENTS_UPDATE` webhook in the Sandbox environment.

sandbox/transfer/fire\_webhook

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The URL to which the webhook should be sent.

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferFireWebhookRequest = {
2  webhook: 'https://www.example.com',
3};
4try {
5  const response = await plaidClient.sandboxTransferFireWebhook(request);
6  // empty response upon success
7} catch (error) {
8  // handle error
9}
```

sandbox/transfer/fire\_webhook

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxtransfersimulate)

[**Simulate a transfer event in Sandbox**](https://plaid.com/docs/api/sandbox/#simulate-a-transfer-event-in-sandbox)

Use the [`/sandbox/transfer/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransfersimulate) endpoint to simulate a transfer event in the Sandbox environment. Note that while an event will be simulated and will appear when using endpoints such as [`/transfer/event/sync`](https://plaid.com/docs/api/products/transfer/reading-transfers/#transfereventsync) or [`/transfer/event/list`](https://plaid.com/docs/api/products/transfer/reading-transfers/#transfereventlist), no transactions will actually take place and funds will not move between accounts, even within the Sandbox.

sandbox/transfer/simulate

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a transfer.

Plaid’s unique identifier for a test clock. If provided, the event to be simulated is created at the `virtual_time` on the provided `test_clock`.

The asynchronous event to be simulated. May be: `posted`, `settled`, `failed`, `funds_available`, or `returned`.

An error will be returned if the event type is incompatible with the current transfer status. Compatible status --> event type transitions include:

`pending` --\> `failed`

`pending` --\> `posted`

`posted` --\> `returned`

`posted` --\> `settled`

`settled` --\> `funds_available` (only applicable to ACH debits.)

The failure reason if the event type for a transfer is `"failed"` or `"returned"`. Null value otherwise.

Hide object

The failure code, e.g. `R01`. A failure code will be provided if and only if the transfer status is `returned`. See [ACH return codes](https://plaid.com/docs/errors/transfer/#ach-return-codes) for a full listing of ACH return codes and [RTP/RfP error codes](https://plaid.com/docs/errors/transfer/#rtprfp-error-codes) for RTP error codes.

The ACH return code, e.g. `R01`. A return code will be provided if and only if the transfer status is `returned`. For a full listing of ACH return codes, see [Transfer errors](https://plaid.com/docs/errors/transfer/#ach-return-codes).

A human-readable description of the reason for the failure or reversal.

The webhook URL to which a `TRANSFER_EVENTS_UPDATE` webhook should be sent.

/sandbox/transfer/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferSimulateRequest = {
2  transfer_id,
3  event_type: 'posted',
4  failure_reason: failureReason,
5};
6try {
7  const response = await plaidClient.sandboxTransferSimulate(request);
8  // empty response upon success
9} catch (error) {
10  // handle error
11}
```

sandbox/transfer/simulate

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/refund/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxtransferrefundsimulate)

[**Simulate a refund event in Sandbox**](https://plaid.com/docs/api/sandbox/#simulate-a-refund-event-in-sandbox)

Use the [`/sandbox/transfer/refund/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferrefundsimulate) endpoint to simulate a refund event in the Sandbox environment. Note that while an event will be simulated and will appear when using endpoints such as [`/transfer/event/sync`](https://plaid.com/docs/api/products/transfer/reading-transfers/#transfereventsync) or [`/transfer/event/list`](https://plaid.com/docs/api/products/transfer/reading-transfers/#transfereventlist), no transactions will actually take place and funds will not move between accounts, even within the Sandbox.

sandbox/transfer/refund/simulate

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a refund.

Plaid’s unique identifier for a test clock. If provided, the event to be simulated is created at the `virtual_time` on the provided `test_clock`.

The asynchronous event to be simulated. May be: `refund.posted`, `refund.settled`, `refund.failed`, or `refund.returned`.

An error will be returned if the event type is incompatible with the current refund status. Compatible status --> event type transitions include:

`refund.pending` --\> `refund.failed`

`refund.pending` --\> `refund.posted`

`refund.posted` --\> `refund.returned`

`refund.posted` --\> `refund.settled`

`refund.posted` events can only be simulated if the refunded transfer has been transitioned to settled. This mimics the ordering of events in Production.

The failure reason if the event type for a transfer is `"failed"` or `"returned"`. Null value otherwise.

Hide object

The failure code, e.g. `R01`. A failure code will be provided if and only if the transfer status is `returned`. See [ACH return codes](https://plaid.com/docs/errors/transfer/#ach-return-codes) for a full listing of ACH return codes and [RTP/RfP error codes](https://plaid.com/docs/errors/transfer/#rtprfp-error-codes) for RTP error codes.

The ACH return code, e.g. `R01`. A return code will be provided if and only if the transfer status is `returned`. For a full listing of ACH return codes, see [Transfer errors](https://plaid.com/docs/errors/transfer/#ach-return-codes).

A human-readable description of the reason for the failure or reversal.

The webhook URL to which a `TRANSFER_EVENTS_UPDATE` webhook should be sent.

/sandbox/transfer/refund/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferRefundSimulateRequest = {
2  refund_id: refundId,
3  event_type: 'refund.posted',
4};
5try {
6  const response = await plaidClient.sandboxTransferRefundSimulate(request);
7  // empty response upon success
8} catch (error) {
9  // handle error
10}
```

sandbox/transfer/refund/simulate

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/sweep/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxtransfersweepsimulate)

[**Simulate creating a sweep**](https://plaid.com/docs/api/sandbox/#simulate-creating-a-sweep)

Use the [`/sandbox/transfer/sweep/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransfersweepsimulate) endpoint to create a sweep and associated events in the Sandbox environment. Upon calling this endpoint, all transfers with a sweep status of `swept` will become `swept_settled`, all `posted` or `pending` transfers with a sweep status of `unswept` will become `swept`, and all `returned` transfers with a sweep status of `swept` will become `return_swept`.

sandbox/transfer/sweep/simulate

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a test clock. If provided, the sweep to be simulated is created on the day of the `virtual_time` on the `test_clock`. If the date of `virtual_time` is on weekend or a federal holiday, the next available banking day is used.

The webhook URL to which a `TRANSFER_EVENTS_UPDATE` webhook should be sent.

/sandbox/transfer/sweep/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1try {
2  const response = await plaidClient.sandboxTransferSweepSimulate({});
3  const sweep = response.data.sweep;
4} catch (error) {
5  // handle error
6}
```

sandbox/transfer/sweep/simulate

**Response fields** and example

A sweep returned from the `/sandbox/transfer/sweep/simulate` endpoint.
Can be null if there are no transfers to include in a sweep.

Hide object

Identifier of the sweep.

The id of the funding account to use, available in the Plaid Dashboard. This determines which of your business checking accounts will be credited or debited.

Plaid’s unique identifier for a Plaid Ledger Balance.

The datetime when the sweep occurred, in RFC 3339 format.

Format: `date-time`

Signed decimal amount of the sweep as it appears on your sweep account ledger (e.g. "-10.00")

If amount is not present, the sweep was net-settled to zero and outstanding debits and credits between the sweep account and Plaid are balanced.

The currency of the sweep, e.g. "USD".

The date when the sweep settled, in the YYYY-MM-DD format.

Format: `date`

The expected date when funds from a ledger deposit will be made available and can be withdrawn from the associated ledger balance. Only applies to deposits. This will be of the form YYYY-MM-DD.

Format: `date`

The status of a sweep transfer

`"pending"` \- The sweep is currently pending
`"posted"` \- The sweep has been posted
`"settled"` \- The sweep has settled. This is the terminal state of a successful credit sweep.
`"returned"` \- The sweep has been returned. This is the terminal state of a returned sweep. Returns of a sweep are extremely rare, since sweeps are money movement between your own bank account and your own Ledger.
`"funds_available"` \- Funds from the sweep have been released from hold and applied to the ledger's available balance. (Only applicable to deposits.) This is the terminal state of a successful deposit sweep.
`"failed"` \- The sweep has failed. This is the terminal state of a failed sweep.

Possible values: `pending`, `posted`, `settled`, `funds_available`, `returned`, `failed`, `null`

The trigger of the sweep

`"manual"` \- The sweep is created manually by the customer
`"incoming"` \- The sweep is created by incoming funds flow (e.g. Incoming Wire)
`"balance_threshold"` \- The sweep is created by balance threshold setting
`"automatic_aggregate"` \- The sweep is created by the Plaid automatic aggregation process. These funds did not pass through the Plaid Ledger balance.

Possible values: `manual`, `incoming`, `balance_threshold`, `automatic_aggregate`

The description of the deposit that will be passed to the receiving bank (up to 10 characters). Note that banks utilize this field differently, and may or may not show it on the bank statement.

The trace identifier for the transfer based on its network. This will only be set after the transfer has posted.

For `ach` or `same-day-ach` transfers, this is the ACH trace number.
For `rtp` transfers, this is the Transaction Identification number.
For `wire` transfers, this is the IMAD (Input Message Accountability Data) number.

The failure reason if the status for a sweep is `"failed"` or `"returned"`. Null value otherwise.

Hide object

The failure code, e.g. `R01`. A failure code will be provided if and only if the sweep status is `returned`. See [ACH return codes](https://plaid.com/docs/errors/transfer/#ach-return-codes) for a full listing of ACH return codes and [RTP/RfP error codes](https://plaid.com/docs/errors/transfer/#rtprfp-error-codes) for RTP error codes.

A human-readable description of the reason for the failure or reversal.

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "sweep": {
3    "id": "d5394a4d-0b04-4a02-9f4a-7ca5c0f52f9d",
4    "funding_account_id": "8945fedc-e703-463d-86b1-dc0607b55460",
5    "created": "2020-08-06T17:27:15Z",
6    "amount": "12.34",
7    "iso_currency_code": "USD",
8    "settled": "2020-08-07",
9    "network_trace_id": null
10  },
11  "request_id": "mdqfuVxeoza6mhu"
12}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/ledger/deposit/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerdepositsimulate)

[**Simulate a ledger deposit event in Sandbox**](https://plaid.com/docs/api/sandbox/#simulate-a-ledger-deposit-event-in-sandbox)

Use the [`/sandbox/transfer/ledger/deposit/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerdepositsimulate) endpoint to simulate a ledger deposit event in the Sandbox environment.

sandbox/transfer/ledger/deposit/simulate

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a sweep.

The asynchronous event to be simulated. May be: `posted`, `settled`, `failed`, or `returned`.

An error will be returned if the event type is incompatible with the current ledger sweep status. Compatible status --> event type transitions include:

`sweep.pending` --\> `sweep.posted`

`sweep.pending` --\> `sweep.failed`

`sweep.posted` --\> `sweep.settled`

`sweep.posted` --\> `sweep.returned`

`sweep.settled` --\> `sweep.returned`

Possible values: `sweep.posted`, `sweep.settled`, `sweep.returned`, `sweep.failed`

The failure reason if the event type for a transfer is `"failed"` or `"returned"`. Null value otherwise.

Hide object

The failure code, e.g. `R01`. A failure code will be provided if and only if the transfer status is `returned`. See [ACH return codes](https://plaid.com/docs/errors/transfer/#ach-return-codes) for a full listing of ACH return codes and [RTP/RfP error codes](https://plaid.com/docs/errors/transfer/#rtprfp-error-codes) for RTP error codes.

The ACH return code, e.g. `R01`. A return code will be provided if and only if the transfer status is `returned`. For a full listing of ACH return codes, see [Transfer errors](https://plaid.com/docs/errors/transfer/#ach-return-codes).

A human-readable description of the reason for the failure or reversal.

/sandbox/transfer/ledger/deposit/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferLedgerDepositSimulateRequest = {
2  sweep_id: 'f4ba7a287eae4d228d12331b68a9f35a',
3  event_type: 'sweep.posted',
4};
5try {
6  const response = await plaidClient.sandboxTransferLedgerDepositSimulate(
7    request,
8  );
9  // empty response upon success
10} catch (error) {
11  // handle error
12}
```

sandbox/transfer/ledger/deposit/simulate

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/ledger/simulate_available`**](https://plaid.com/docs/api/sandbox/#sandboxtransferledgersimulate_available)

[**Simulate converting pending balance to available balance**](https://plaid.com/docs/api/sandbox/#simulate-converting-pending-balance-to-available-balance)

Use the [`/sandbox/transfer/ledger/simulate_available`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgersimulate_available) endpoint to simulate converting pending balance to available balance for all originators in the Sandbox environment.

sandbox/transfer/ledger/simulate\_available

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Specify which ledger balance to simulate converting pending balance to available balance. If this field is left blank, this will default to id of the default ledger balance.

Client ID of the end customer (i.e. the originator). Only applicable to Platform Payments customers.

Plaid’s unique identifier for a test clock. If provided, only the pending balance that is due before the `virtual_timestamp` on the test clock will be converted.

The webhook URL to which a `TRANSFER_EVENTS_UPDATE` webhook should be sent.

/sandbox/transfer/ledger/simulate\_available

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1try {
2  const response = await plaidClient.sandboxTransferLedgerSimulateAvailable({});
3  const available = response.data.balance.available;
4} catch (error) {
5  // handle error
6}
```

sandbox/transfer/ledger/simulate\_available

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/ledger/withdraw/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerwithdrawsimulate)

[**Simulate a ledger withdraw event in Sandbox**](https://plaid.com/docs/api/sandbox/#simulate-a-ledger-withdraw-event-in-sandbox)

Use the [`/sandbox/transfer/ledger/withdraw/simulate`](https://plaid.com/docs/api/sandbox/#sandboxtransferledgerwithdrawsimulate) endpoint to simulate a ledger withdraw event in the Sandbox environment.

sandbox/transfer/ledger/withdraw/simulate

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a sweep.

The asynchronous event to be simulated. May be: `posted`, `settled`, `failed`, or `returned`.

An error will be returned if the event type is incompatible with the current ledger sweep status. Compatible status --> event type transitions include:

`sweep.pending` --\> `sweep.posted`

`sweep.pending` --\> `sweep.failed`

`sweep.posted` --\> `sweep.settled`

`sweep.posted` --\> `sweep.returned`

`sweep.settled` --\> `sweep.returned`

Possible values: `sweep.posted`, `sweep.settled`, `sweep.returned`, `sweep.failed`

The failure reason if the event type for a transfer is `"failed"` or `"returned"`. Null value otherwise.

Hide object

The failure code, e.g. `R01`. A failure code will be provided if and only if the transfer status is `returned`. See [ACH return codes](https://plaid.com/docs/errors/transfer/#ach-return-codes) for a full listing of ACH return codes and [RTP/RfP error codes](https://plaid.com/docs/errors/transfer/#rtprfp-error-codes) for RTP error codes.

The ACH return code, e.g. `R01`. A return code will be provided if and only if the transfer status is `returned`. For a full listing of ACH return codes, see [Transfer errors](https://plaid.com/docs/errors/transfer/#ach-return-codes).

A human-readable description of the reason for the failure or reversal.

/sandbox/transfer/ledger/withdraw/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferLedgerWithdrawSimulateRequest = {
2  sweep_id: 'f4ba7a287eae4d228d12331b68a9f35a',
3  event_type: 'sweep.posted',
4};
5try {
6  const response = await plaidClient.sandboxTransferLedgerWithdrawSimulate(
7    request,
8  );
9  // empty response upon success
10} catch (error) {
11  // handle error
12}
```

sandbox/transfer/ledger/withdraw/simulate

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/test_clock/create`**](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockcreate)

[**Create a test clock**](https://plaid.com/docs/api/sandbox/#create-a-test-clock)

Use the [`/sandbox/transfer/test_clock/create`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockcreate) endpoint to create a `test_clock` in the Sandbox environment.

A test clock object represents an independent timeline and has a `virtual_time` field indicating the current timestamp of the timeline. Test clocks are used for testing recurring transfers in Sandbox.

A test clock can be associated with up to 5 recurring transfers.

sandbox/transfer/test\_clock/create

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The virtual timestamp on the test clock. If not provided, the current timestamp will be used. This will be of the form `2006-01-02T15:04:05Z`.

Format: `date-time`

/sandbox/transfer/test\_clock/create

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferTestClockCreateRequest = {
2  virtual_time: '2006-01-02T15:04:05Z',
3};
4try {
5  const response = await plaidClient.sandboxTransferTestClockCreate(request);
6  const test_clock = response.data.test_clock;
7} catch (error) {
8  // handle error
9}
```

sandbox/transfer/test\_clock/create

**Response fields** and example

Collapse all

Defines the test clock for a transfer.

Hide object

Plaid’s unique identifier for a test clock. This field is only populated in the Sandbox environment, and only if a `test_clock_id` was included in the `/transfer/recurring/create` request. For more details, see [Simulating recurring transfers](https://plaid.com/docs/transfer/sandbox/#simulating-recurring-transfers).

The virtual timestamp on the test clock. This will be of the form `2006-01-02T15:04:05Z`.

Format: `date-time`

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "test_clock": {
3    "test_clock_id": "b33a6eda-5e97-5d64-244a-a9274110151c",
4    "virtual_time": "2006-01-02T15:04:05Z"
5  },
6  "request_id": "mdqfuVxeoza6mhu"
7}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/test_clock/advance`**](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockadvance)

[**Advance a test clock**](https://plaid.com/docs/api/sandbox/#advance-a-test-clock)

Use the [`/sandbox/transfer/test_clock/advance`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockadvance) endpoint to advance a `test_clock` in the Sandbox environment.

A test clock object represents an independent timeline and has a `virtual_time` field indicating the current timestamp of the timeline. A test clock can be advanced by incrementing `virtual_time`, but may never go back to a lower `virtual_time`.

If a test clock is advanced, we will simulate the changes that ought to occur during the time that elapsed.

For example, a client creates a weekly recurring transfer with a test clock set at t. When the client advances the test clock by setting `virtual_time` = t + 15 days, 2 new originations should be created, along with the webhook events.

The advancement of the test clock from its current `virtual_time` should be limited such that there are no more than 20 originations resulting from the advance operation on each `recurring_transfer` associated with the `test_clock`.

For example, if the recurring transfer associated with this test clock originates once every 4 weeks, you can advance the `virtual_time` up to 80 weeks on each API call.

sandbox/transfer/test\_clock/advance

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a test clock. This field is only populated in the Sandbox environment, and only if a `test_clock_id` was included in the `/transfer/recurring/create` request. For more details, see [Simulating recurring transfers](https://plaid.com/docs/transfer/sandbox/#simulating-recurring-transfers).

The virtual timestamp on the test clock. This will be of the form `2006-01-02T15:04:05Z`.

Format: `date-time`

/sandbox/transfer/test\_clock/advance

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferTestClockAdvanceRequest = {
2  test_clock_id: 'b33a6eda-5e97-5d64-244a-a9274110151c',
3  new_virtual_time: '2006-01-02T15:04:05Z',
4};
5try {
6  const response = await plaidClient.sandboxTransferTestClockAdvance(request);
7} catch (error) {
8  // handle error
9}
```

sandbox/transfer/test\_clock/advance

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/test_clock/get`**](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockget)

[**Get a test clock**](https://plaid.com/docs/api/sandbox/#get-a-test-clock)

Use the [`/sandbox/transfer/test_clock/get`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clockget) endpoint to get a `test_clock` in the Sandbox environment.

sandbox/transfer/test\_clock/get

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

Plaid’s unique identifier for a test clock. This field is only populated in the Sandbox environment, and only if a `test_clock_id` was included in the `/transfer/recurring/create` request. For more details, see [Simulating recurring transfers](https://plaid.com/docs/transfer/sandbox/#simulating-recurring-transfers).

/sandbox/transfer/test\_clock/get

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferTestClockGetRequest = {
2  test_clock_id: 'b33a6eda-5e97-5d64-244a-a9274110151c',
3};
4try {
5  const response = await plaidClient.sandboxTransferTestClockGet(request);
6  const test_clock = response.data.test_clock;
7} catch (error) {
8  // handle error
9}
```

sandbox/transfer/test\_clock/get

**Response fields** and example

Collapse all

Defines the test clock for a transfer.

Hide object

Plaid’s unique identifier for a test clock. This field is only populated in the Sandbox environment, and only if a `test_clock_id` was included in the `/transfer/recurring/create` request. For more details, see [Simulating recurring transfers](https://plaid.com/docs/transfer/sandbox/#simulating-recurring-transfers).

The virtual timestamp on the test clock. This will be of the form `2006-01-02T15:04:05Z`.

Format: `date-time`

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "test_clock": {
3    "test_clock_id": "b33a6eda-5e97-5d64-244a-a9274110151c",
4    "virtual_time": "2006-01-02T15:04:05Z"
5  },
6  "request_id": "mdqfuVxeoza6mhu"
7}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transfer/test_clock/list`**](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clocklist)

[**List test clocks**](https://plaid.com/docs/api/sandbox/#list-test-clocks)

Use the [`/sandbox/transfer/test_clock/list`](https://plaid.com/docs/api/sandbox/#sandboxtransfertest_clocklist) endpoint to see a list of all your test clocks in the Sandbox environment, by ascending `virtual_time`. Results are paginated; use the `count` and `offset` query parameters to retrieve the desired test clocks.

sandbox/transfer/test\_clock/list

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The start virtual timestamp of test clocks to return. This should be in RFC 3339 format (i.e. `2019-12-06T22:35:49Z`)

Format: `date-time`

The end virtual timestamp of test clocks to return. This should be in RFC 3339 format (i.e. `2019-12-06T22:35:49Z`)

Format: `date-time`

The maximum number of test clocks to return.

Minimum: `1`

Maximum: `25`

Default: `25`

The number of test clocks to skip before returning results.

Default: `0`

Minimum: `0`

/sandbox/transfer/test\_clock/list

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransferTestClockListRequest = {
2  count: 2,
3};
4try {
5  const response = await plaidClient.sandboxTransferTestClockList(request);
6  const test_clocks = response.data.test_clocks;
7} catch (error) {
8  // handle error
9}
```

sandbox/transfer/test\_clock/list

**Response fields** and example

Collapse all

Hide object

Plaid’s unique identifier for a test clock. This field is only populated in the Sandbox environment, and only if a `test_clock_id` was included in the `/transfer/recurring/create` request. For more details, see [Simulating recurring transfers](https://plaid.com/docs/transfer/sandbox/#simulating-recurring-transfers).

The virtual timestamp on the test clock. This will be of the form `2006-01-02T15:04:05Z`.

Format: `date-time`

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "test_clocks": [\
3    {\
4      "test_clock_id": "b33a6eda-5e97-5d64-244a-a9274110151c",\
5      "virtual_time": "2006-01-02T15:04:05Z"\
6    },\
7    {\
8      "test_clock_id": "a33a6eda-5e97-5d64-244a-a9274110152d",\
9      "virtual_time": "2006-02-02T15:04:05Z"\
10    }\
11  ],
12  "request_id": "mdqfuVxeoza6mhu"
13}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/income/fire_webhook`**](https://plaid.com/docs/api/sandbox/#sandboxincomefire_webhook)

[**Manually fire an Income webhook**](https://plaid.com/docs/api/sandbox/#manually-fire-an-income-webhook)

Use the [`/sandbox/income/fire_webhook`](https://plaid.com/docs/api/sandbox/#sandboxincomefire_webhook) endpoint to manually trigger a Payroll or Document Income webhook in the Sandbox environment.

sandbox/income/fire\_webhook

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The Item ID associated with the verification.

The Plaid `user_id` of the User associated with this webhook, warning, or error.

The URL to which the webhook should be sent.

`VERIFICATION_STATUS_PROCESSING_COMPLETE`: The income verification status processing has completed. If the user uploaded multiple documents, this webhook will fire when all documents have finished processing. Call the `/income/verification/paystubs/get` endpoint and check the document metadata to see which documents were successfully parsed.

`VERIFICATION_STATUS_PROCESSING_FAILED`: A failure occurred when attempting to process the verification documentation.

`VERIFICATION_STATUS_PENDING_APPROVAL`: (deprecated) The income verification has been sent to the user for review.

Possible values: `VERIFICATION_STATUS_PROCESSING_COMPLETE`, `VERIFICATION_STATUS_PROCESSING_FAILED`, `VERIFICATION_STATUS_PENDING_APPROVAL`

The webhook codes that can be fired by this test endpoint.

Possible values: `INCOME_VERIFICATION`, `INCOME_VERIFICATION_RISK_SIGNALS`

Select group for content switcher

Current librariesLegacy libraries

/sandbox/income/fire\_webhook

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxIncomeFireWebhookRequest = {
2  item_id: 'Rn3637v1adCNj5Dl1LG6idQBzqBLwRcRZLbgM',
3  webhook: 'https://webhook.com/',
4  verification_status: 'VERIFICATION_STATUS_PROCESSING_COMPLETE',
5};
6try {
7  const response = await plaidClient.sandboxIncomeFireWebhook(request);
8  // empty response upon success
9} catch (error) {
10  // handle error
11}
```

sandbox/income/fire\_webhook

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/cra/cashflow_updates/update`**](https://plaid.com/docs/api/sandbox/#sandboxcracashflow_updatesupdate)

[**Trigger an update for Cash Flow Updates**](https://plaid.com/docs/api/sandbox/#trigger-an-update-for-cash-flow-updates)

Use the [`/sandbox/cra/cashflow_updates/update`](https://plaid.com/docs/api/sandbox/#sandboxcracashflow_updatesupdate) endpoint to manually trigger an update for Cash Flow Updates (Monitoring) in the Sandbox environment.

sandbox/cra/cashflow\_updates/update

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The user token associated with the User data is being requested for.

Webhook codes corresponding to the Cash Flow Updates events to be simulated.

Possible values: `LARGE_DEPOSIT_DETECTED`, `LOW_BALANCE_DETECTED`, `NEW_LOAN_PAYMENT_DETECTED`, `NSF_OVERDRAFT_DETECTED`

/sandbox/cra/cashflow\_updates/update

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxCraCashflowUpdatesUpdateRequest = {
2  user_token: 'user-environment-1234567-abcd-abcd-1234-1234567890ab',
3  webhook_codes: ['LARGE_DEPOSIT_DETECTED', 'LOW_BALANCE_DETECTED'],
4};
5try {
6  const response = await plaidClient.sandbox_cra_cashflow_updates_update(request);
7  // empty response upon success
8} catch (error) {
9  // handle error
10}
```

sandbox/cra/cashflow\_updates/update

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "mdqfuVxeoza6mhu"
3}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/payment/simulate`**](https://plaid.com/docs/api/sandbox/#sandboxpaymentsimulate)

[**Simulate a payment event in Sandbox**](https://plaid.com/docs/api/sandbox/#simulate-a-payment-event-in-sandbox)

Use the [`/sandbox/payment/simulate`](https://plaid.com/docs/api/sandbox/#sandboxpaymentsimulate) endpoint to simulate various payment events in the Sandbox environment. This endpoint will trigger the corresponding payment status webhook.

sandbox/payment/simulate

**Request fields**

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The ID of the payment to simulate

The webhook url to use for any payment events triggered by the simulated status change.

The status to set the payment to.

Valid statuses include:

- `PAYMENT_STATUS_INITIATED`
- `PAYMENT_STATUS_INSUFFICIENT_FUNDS`
- `PAYMENT_STATUS_FAILED`
- `PAYMENT_STATUS_EXECUTED`
- `PAYMENT_STATUS_SETTLED`
- `PAYMENT_STATUS_CANCELLED`
- `PAYMENT_STATUS_REJECTED`

/sandbox/payment/simulate

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxPaymentSimulateRequest = {
2  payment_id: 'payment-id-sandbox-feca8a7a-5591-4aef-9297-f3062bb735d3',
3  status: "PAYMENT_STATUS_INITIATED"
4};
5try {
6  const response = await plaidClient.sandbox_payment_simulate(request);
7} catch (error) {
8  // handle error
9}
```

sandbox/payment/simulate

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

The status of the payment.

Core lifecycle statuses:

`PAYMENT_STATUS_INPUT_NEEDED`: **Transitional.** The payment is awaiting user input to continue processing. It may re-enter this state if additional input is required.

`PAYMENT_STATUS_AUTHORISING`: **Transitional.** The payment is being authorised by the financial institution. It will automatically move on once authorisation completes.

`PAYMENT_STATUS_INITIATED`: **Transitional.** The payment has been authorised and accepted by the financial institution and is now in transit. A payment should be considered complete once it reaches the `PAYMENT_STATUS_EXECUTED` state or the funds settle in the recipient account.

`PAYMENT_STATUS_EXECUTED`: **Terminal.** The funds have left the payer’s account and the payment is en route to settlement. Support is more common in the UK than in the EU; where unsupported, a successful payment remains in `PAYMENT_STATUS_INITIATED` before settling. When using Plaid Virtual Accounts, `PAYMENT_STATUS_EXECUTED` is not terminal—the payment will continue to `PAYMENT_STATUS_SETTLED` once funds are available.

`PAYMENT_STATUS_SETTLED`: **Terminal.** The funds are available in the recipient’s account. Only available to customers using [Plaid Virtual Accounts](https://plaid.com/docs/payment-initiation/virtual-accounts/).

Failure statuses:

`PAYMENT_STATUS_INSUFFICIENT_FUNDS`: **Terminal.** The payment failed due to insufficient funds. No further retries will succeed until the payer’s balance is replenished.

`PAYMENT_STATUS_FAILED`: **Terminal (retryable).** The payment could not be initiated due to a system error or outage. Retry once the root cause is resolved.

`PAYMENT_STATUS_BLOCKED`: **Terminal (retryable).** The payment was blocked by Plaid (e.g., flagged as risky). Resolve any compliance or risk issues and retry.

`PAYMENT_STATUS_REJECTED`: **Terminal.** The payment was rejected by the financial institution. No automatic retry is possible.

`PAYMENT_STATUS_CANCELLED`: **Terminal.** The end user cancelled the payment during authorisation.

Standing-order statuses:

`PAYMENT_STATUS_ESTABLISHED`: **Terminal.** A recurring/standing order has been successfully created.

Deprecated (to be removed in a future release):

`PAYMENT_STATUS_UNKNOWN`: The payment status is unknown.

`PAYMENT_STATUS_PROCESSING`: The payment is currently being processed.

`PAYMENT_STATUS_COMPLETED`: Indicates that the standing order has been successfully established.

Possible values: `PAYMENT_STATUS_INPUT_NEEDED`, `PAYMENT_STATUS_PROCESSING`, `PAYMENT_STATUS_INITIATED`, `PAYMENT_STATUS_COMPLETED`, `PAYMENT_STATUS_INSUFFICIENT_FUNDS`, `PAYMENT_STATUS_FAILED`, `PAYMENT_STATUS_BLOCKED`, `PAYMENT_STATUS_UNKNOWN`, `PAYMENT_STATUS_EXECUTED`, `PAYMENT_STATUS_SETTLED`, `PAYMENT_STATUS_AUTHORISING`, `PAYMENT_STATUS_CANCELLED`, `PAYMENT_STATUS_ESTABLISHED`, `PAYMENT_STATUS_REJECTED`

The status of the payment.

Core lifecycle statuses:

`PAYMENT_STATUS_INPUT_NEEDED`: **Transitional.** The payment is awaiting user input to continue processing. It may re-enter this state if additional input is required.

`PAYMENT_STATUS_AUTHORISING`: **Transitional.** The payment is being authorised by the financial institution. It will automatically move on once authorisation completes.

`PAYMENT_STATUS_INITIATED`: **Transitional.** The payment has been authorised and accepted by the financial institution and is now in transit. A payment should be considered complete once it reaches the `PAYMENT_STATUS_EXECUTED` state or the funds settle in the recipient account.

`PAYMENT_STATUS_EXECUTED`: **Terminal.** The funds have left the payer’s account and the payment is en route to settlement. Support is more common in the UK than in the EU; where unsupported, a successful payment remains in `PAYMENT_STATUS_INITIATED` before settling. When using Plaid Virtual Accounts, `PAYMENT_STATUS_EXECUTED` is not terminal—the payment will continue to `PAYMENT_STATUS_SETTLED` once funds are available.

`PAYMENT_STATUS_SETTLED`: **Terminal.** The funds are available in the recipient’s account. Only available to customers using [Plaid Virtual Accounts](https://plaid.com/docs/payment-initiation/virtual-accounts/).

Failure statuses:

`PAYMENT_STATUS_INSUFFICIENT_FUNDS`: **Terminal.** The payment failed due to insufficient funds. No further retries will succeed until the payer’s balance is replenished.

`PAYMENT_STATUS_FAILED`: **Terminal (retryable).** The payment could not be initiated due to a system error or outage. Retry once the root cause is resolved.

`PAYMENT_STATUS_BLOCKED`: **Terminal (retryable).** The payment was blocked by Plaid (e.g., flagged as risky). Resolve any compliance or risk issues and retry.

`PAYMENT_STATUS_REJECTED`: **Terminal.** The payment was rejected by the financial institution. No automatic retry is possible.

`PAYMENT_STATUS_CANCELLED`: **Terminal.** The end user cancelled the payment during authorisation.

Standing-order statuses:

`PAYMENT_STATUS_ESTABLISHED`: **Terminal.** A recurring/standing order has been successfully created.

Deprecated (to be removed in a future release):

`PAYMENT_STATUS_UNKNOWN`: The payment status is unknown.

`PAYMENT_STATUS_PROCESSING`: The payment is currently being processed.

`PAYMENT_STATUS_COMPLETED`: Indicates that the standing order has been successfully established.

Possible values: `PAYMENT_STATUS_INPUT_NEEDED`, `PAYMENT_STATUS_PROCESSING`, `PAYMENT_STATUS_INITIATED`, `PAYMENT_STATUS_COMPLETED`, `PAYMENT_STATUS_INSUFFICIENT_FUNDS`, `PAYMENT_STATUS_FAILED`, `PAYMENT_STATUS_BLOCKED`, `PAYMENT_STATUS_UNKNOWN`, `PAYMENT_STATUS_EXECUTED`, `PAYMENT_STATUS_SETTLED`, `PAYMENT_STATUS_AUTHORISING`, `PAYMENT_STATUS_CANCELLED`, `PAYMENT_STATUS_ESTABLISHED`, `PAYMENT_STATUS_REJECTED`

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "m8MDnv9okwxFNBV",
3  "old_status": "PAYMENT_STATUS_INPUT_NEEDED",
4  "new_status": "PAYMENT_STATUS_INITIATED"
5}
```

##### Was this helpful?

YesNo

=\*=\*=\*= [**`/sandbox/transactions/create`**](https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate)

[**Create sandbox transactions**](https://plaid.com/docs/api/sandbox/#create-sandbox-transactions)

Use the [`/sandbox/transactions/create`](https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate) endpoint to create new transactions for an existing Item. This endpoint can be used to add up to 10 transactions to any Item at a time.

This endpoint can only be used with Items that were created in the Sandbox environment using the `user_transactions_dynamic` test user. You can use this to add transactions to test the [`/transactions/get`](https://plaid.com/docs/api/products/transactions/#transactionsget) and [`/transactions/sync`](https://plaid.com/docs/api/products/transactions/#transactionssync) endpoints.

sandbox/transactions/create

**Request fields**

Collapse all

Your Plaid API `client_id`. The `client_id` is required and may be provided either in the `PLAID-CLIENT-ID` header or as part of a request body.

Your Plaid API `secret`. The `secret` is required and may be provided either in the `PLAID-SECRET` header or as part of a request body.

The access token associated with the Item data is being requested for.

List of transactions to be added

Hide object

The date of the transaction, in [ISO 8601](https://wikipedia.org/wiki/ISO_8601) (YYYY-MM-DD) format. Transaction date must be the present date or a date up to 14 days in the past. Future dates are not allowed.

Format: `date`

The date the transaction posted, in [ISO 8601](https://wikipedia.org/wiki/ISO_8601) (YYYY-MM-DD) format. Posted date must be the present date or a date up to 14 days in the past. Future dates are not allowed.

Format: `date`

The transaction amount. Can be negative.

Format: `double`

The transaction description.

The ISO-4217 format currency code for the transaction. Defaults to USD.

/sandbox/transactions/create

Node

Select Language

- Curl
- Node
- Python
- Ruby
- Java
- Go

```CodeBlock-module_code__18Tbe

1const request: SandboxTransactionsCreateRequest = {
2  access_token: accessToken,
3  transactions: [\
4    {\
5      amount: 100.50,\
6      date_posted: '2025-06-08',\
7      date_transacted: '2025-06-08',\
8      description: 'Tim Hortons'\
9    },\
10    {\
11      amount: -25.75,\
12      date_posted: '2025-06-08',\
13      date_transacted: '2025-06-08',\
14      description: 'BestBuy',\
15      iso_currency_code: 'CAD'\
16    }\
17  ]
18};
19try {
20  const response = await plaidClient.sandbox_transactions_create(request);
21} catch (error) {
22  // handle error
23}
```

sandbox/transactions/create

**Response fields** and example

A unique identifier for the request, which can be used for troubleshooting. This identifier, like all Plaid identifiers, is case sensitive.

API Object

```CodeBlock-module_code__18Tbe

1{
2  "request_id": "m8MDnv9okwxFNBV"
3}
```

##### Was this helpful?

YesNo