# Modularity Frontend Form

A modular, accessible, and extensible multi-step frontend form system for WordPress, built with TypeScript, PHP, and SCSS. Supports custom field types, validation, REST API integration, and advanced admin configuration.

---

## Features

- **Multi-step forms**: Create forms with any number of steps, each with its own fields, validation, and UI.
- **Custom field types**: Supports text, email, date, checkbox, select, WYSIWYG, repeater, and more.
- **Progress bar**: Visual step progress indicator with validation feedback.
- **REST API integration**: Submit, update, and read form data via secure endpoints.
- **Admin configuration**: Use ACF to configure steps, fields, handlers, and logic.
- **Validation**: Client and server-side validation, including custom error messages.
- **Accessibility**: ARIA attributes, keyboard navigation, and semantic HTML.
- **Status overlays**: User feedback for loading, errors, and success.
- **Security**: Nonces, token validation, and output escaping.
- **Extensible**: Add custom field types, handlers, and hooks.

---

## Usage

### 1. Add a Form Module

- In WordPress admin, add a new \"Frontend Form\" module.
- Configure steps and fields using the ACF field group \"Configure Multistep Form\".
- Each step can have a title, description, and any number of fields.
- Supported field types: text, email, date, checkbox, select, WYSIWYG, repeater, etc.

### 2. Configure Submission Handlers

- Choose where submissions are sent: Database, E-Mail, Webhook.
- Configure handler settings in the module admin (e.g., webhook URL, email recipient).

#### Webhook request formats

`json` is the default. It defaults to `Content-Type: application/json` and never attaches files.
Select `multipart` to send fields to a compatible multipart receiver.
The multipart body uses PHP-compatible field names such as `title`, `acf[location][lat]`, and `acf[image]`; uploaded images use their destination field name as the file part.
Multipart requests send `Content-Type: multipart/form-data` and `X-ACF-Rest-Upload: true`.

This profile makes exactly one HTTP transport attempt. It sends no idempotency key and does not retry or fall back to JSON.

A timeout does not prove that the receiver saved nothing.
Manual or browser resubmissions are independent requests. They can duplicate posts, images, and notifications.
This profile does not prevent duplicates or recover partial data after a crash.
Check the destination before resubmitting.

Map an image with `{{image}}` as the complete value of an object property. Indexed placeholders such as `{{image.0}}` are rejected.
The template determines the destination: `{"image":"{{image}}"}` sends a file part named `image`, while `{"data":{"photo":"{{image}}"}}` sends `data[photo]`. Image destinations can be nested objects, but cannot be inside arrays.
In multipart mode, `{{*}}` includes ordinary field values but omits image fields. Only top-level image fields are supported.
Wrap an optional value as `{"$optional":"<field>","$value":...}` to omit its whole subtree when the field is absent. Multipart cannot represent explicitly authored `null`, empty arrays, or empty objects.

### 3. Display the Form

- Use the module in any Modularity-enabled area (template, block, shortcode).
- The form will render with animated step transitions, progress bar, and validation.

### 4. REST API Endpoints

- Submit: `POST /wp-json/modularity-frontend-form/v1/submit/post`
- Update: `POST /wp-json/modularity-frontend-form/v1/submit/update`
- Read:   `GET  /wp-json/modularity-frontend-form/v1/read/get`
- Nonce:  `GET  /wp-json/modularity-frontend-form/v1/nonce/get`
- All endpoints require valid nonces and tokens for security.

### 5. Customization

- Add new field types by extending the JS/TS field architecture.
- Add new handlers by implementing PHP handler interfaces.
- Use SCSS variables for theming in `sass/_variables.scss`.
- Override translations in the admin or via language files.

---

## Example: Basic Usage

1. **Add a module**:  
   - Go to \"Add Module\" → \"Frontend Form\".
   - Configure steps and fields.

2. **Display in template**:  
   - Use Modularity's template system or shortcode to render the form.

3. **Handle submissions**:  
   - Data is stored, emailed, or sent to a webhook as configured.

---

## Developer Guide

- **JS/TS**: All frontend logic is in `/source/js/`. Use TypeScript interfaces for all APIs.
- **PHP**: Backend logic, REST API, and admin config in `/source/php/`.
- **SCSS**: Styles in `/source/sass/`. Use variables for theming.
- **Tests**: Unit tests are next to source files. Run with `npm test` (JS/TS) or `composer test` (PHP).
- **Linting**: Use `npm run lint` for JS/TS.

---

## Accessibility & UX

- All UI components are ARIA-compliant and keyboard accessible.
- Animations are smooth and non-blocking.
- Progress bar and step navigation are visually clear.

---

## Security

- All output is escaped in PHP templates.
- All user input is validated and sanitized.
- Nonces and tokens are required for all REST API requests.

---

## Extending the Plugin

- **Add a field type**: Create a new JS/TS class in `/source/js/fields/field/`.
- **Add a handler**: Implement a PHP handler in `/source/php/DataProcessor/Handlers/`.
- **Add a REST endpoint**: Extend `/source/php/Api/`.

## Logging

Logging is disabled by default. Set `WP_DEBUG_LOG` to `true` to write logs via `error_log()`.

Control the minimum log level with these constants (PSR-3 levels: `emergency` › `alert` › `critical` › `error` › `warning` › `notice` › `info` › `debug`):

At debug level, prepared multipart webhooks log top-level value types and the encoded field/file-part names. Field values, uploaded filenames, local paths, headers, and file contents are not included in this diagnostic.

| Constant | Default | Description |
|---|---|---|
| `MODULARITY_FRONTEND_FORM_LOG_LEVEL` | — | Log level for this plugin. Overrides `APP_LOG_LEVEL`. |
| `APP_LOG_LEVEL` | `error` | Global fallback log level. |

```php
// wp-config.php — enable debug logging for this plugin
define('WP_DEBUG_LOG', true);
define('MODULARITY_FRONTEND_FORM_LOG_LEVEL', 'debug');
```

---

## Actions
### ModularityFrontendForm/afterInsertPost
* ```@param int|WP_Error $result``` 
```php
do_action('ModularityFrontendForm/afterInsertPost', $result);
```

---

## Contribution Guidelines

- Fork, branch, and submit pull requests for all changes.
- Write clear commit messages.
- Review code for style, security, and performance.
- Follow the standards in `.github/copilot-instructions.md`.

---

## License

MIT

---

For more details, see `.github/copilot-instructions.md` and the source code. All code, documentation, and contributions must follow workspace guidelines.


## Linked location fields and extension validation

Domain plugins can opt a taxonomy selector into shared-location behavior by setting `frontend_form_linked_location` on its ACF field. Configure `sourceField`, `nameField`, `addressField`, `attendanceField`, `termsUrl`, `matchesUrl`, and translated `strings` (see Event Manager's `PlaceFields`). Field references are ACF field keys. Source values are `existing`, `new`, or `legacy`; online attendance bypasses physical-location checks. Optional `frontend_form_option_label_meta` appends the address from the named term meta map to option labels. Unconfigured fields keep their existing behavior.

The term endpoint returns `{id, name, place: {name, address, latitude, longitude}}`; the match endpoint returns an array of those records. The selected place populates the existing map and makes it read-only. A new name is checked after typing and before advancing or submitting. Failed checks require an explicit retry or bypass. All business rules and write authorization remain the domain plugin's responsibility.

- PHP filter `ModularityFrontendForm/validateSubmission` receives `(true, data, WP_REST_Request, ModuleConfigInterface, ConfigInterface)` before storage or other handlers run. Return `true` or a `WP_Error`. Domain error messages/data are preserved under the standard `validation_error` response, with the original code in `data.reason`.
- Filter `ModularityFrontendForm/readFormData` receives `(fieldData, postId, allowedFieldKeys)` so domain plugins can supply missing values for newly added fields when editing older records. Only add keys that belong to the configured form.
- Action `ModularityFrontendForm/afterUpdatePost` runs after updated ACF fields are stored, matching the existing `afterInsertPost` boundary. Update requests retain the form-data namespace and use the authenticated route's post ID.
- DOM event `modularity-frontend-form:beforeProceed` exposes `{scope, waitUntil(Promise<boolean>)}` for opt-in asynchronous checks before advancing and submitting. A false/rejected check blocks the action.
- DOM event `modularity-frontend-form:populated` runs after an editing form has loaded its values and refreshed its field conditions.

Verification uses `composer test`, `npm test`, `npx tsc --noEmit` and `npm run build`. The scoped OpenStreetMap package is hosted in GitHub Packages and may require the project's existing registry access. A local source build of the matching public Git tag can be used for development without changing the committed dependency declaration.
