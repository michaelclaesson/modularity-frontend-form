<?php

namespace ModularityFrontendForm\Api\Read;

use AcfService\AcfService;
use ModularityFrontendForm\Api\RestApiEndpoint;
use \ModularityFrontendForm\Config\ConfigInterface;
use ModularityFrontendForm\Config\ModuleConfigFactoryInterface;
use ModularityFrontendForm\Config\GetModuleConfigInstanceTrait;
use ModularityFrontendForm\DataProcessor\DataProcessor;
use ModularityFrontendForm\Api\RestApiParams;
use ModularityFrontendForm\Api\RestApiParamEnums;
use WP_Error;
use WP_Http;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WpService\WpService;
use Municipio\Schema\Schema;

use ModularityFrontendForm\Api\RestApiResponseStatusEnums;

use ModularityFrontendForm\Api\Read\GetReturnTypeEnum;

class Get extends RestApiEndpoint
{
    use GetModuleConfigInstanceTrait;

    public const NAMESPACE = 'modularity-frontend-form/v1';
    public const ROUTE     = 'read/get';
    public const KEY       = 'getForm';

    public function __construct(
        private WpService $wpService,
        private AcfService $acfService,
        private ConfigInterface $config,
        private ModuleConfigFactoryInterface $moduleConfigFactory
    ) {}

    /**
     * Registers a REST route
     *
     * @return bool Whether the route was registered successfully
     */
    public function handleRegisterRestRoute(): bool
    {
        return register_rest_route(self::NAMESPACE, self::ROUTE, array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array($this, 'handleRequest'),
            'permission_callback' => '__return_true',
            'args' => (new RestApiParams($this->wpService, $this->config, $this->moduleConfigFactory))->getParamSpecification(
                RestApiParamEnums::ModuleId,
                RestApiParamEnums::Nonce,
                RestApiParamEnums::PostId,
                RestApiParamEnums::Token
            )
        ));
    }

    /**
     * Handles a REST request to submit a form
     *
     * @param WP_REST_Request $request The REST request object
     *
     * @return WP_REST_Response|WP_Error The response object or an error
     */
    public function handleRequest(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $this->filterReturnTypeSetting();

        $params = (new RestApiParams(
            $this->wpService,
            $this->config,
            $this->moduleConfigFactory
        ))->getValuesFromRequest($request);

        //Get fields from post id 
        $fieldData = get_field_objects($params->postId, false);
        $fieldData = $this->retrieveValues($fieldData);
        $fieldData = $this->translateFieldNamesToFieldKeys($params->postId, $fieldData);
        $fieldData = $this->filterUnmappedFieldKeysForPostType($params->moduleId, $fieldData);
        $fieldData = $this->wpService->applyFilters(
            'ModularityFrontendForm/readFormData',
            $fieldData,
            $params->postId,
            $this->getModuleConfigInstance($params->moduleId)->getFieldKeysRegisteredAsFormFields() ?? []
        );

        // Add standard WordPress fields after filtering ACF fields.
        $fieldData       = $this->prependPostFieldsToFieldData($fieldData, $params->postId, $params->moduleId);

        if ($fieldData !== false) {
            return new WP_REST_Response(
                [
                    'status' => RestApiResponseStatusEnums::Success,
                    'data'   => $fieldData,
                ],
                WP_Http::OK
            );
        }

        return new WP_REST_Response(
            [
                'status' => RestApiResponseStatusEnums::Success
            ],
            WP_Http::NOT_FOUND
        );
    }

    private function retrieveValues(array $fieldData): array
    {
        $fields = [];
        foreach ($fieldData as $field) {
            switch ($field['type']) {
                case 'gallery':
                case 'file':
                case 'image':
                    $fields[$field['name']] = $this->retrieveValuesFileField($field);
                    break;
                case 'google_map':
                    $fields[$field['name']] = $this->convertGoogleMapFieldValueToSchema($field);
                    break;
                default:
                    $fields[$field['name']] = $field['value'];
                    break;
            }
        }

        return $fields;
    }

    private function convertGoogleMapFieldValueToSchema(array $field): ?\Municipio\Schema\Place
    {
        if (empty($field['value']) || !is_array($field['value'])) {
            return null;
        }

        $value = $field['value'];
        $streetAddress = ($value['street_name'] ?? '') . ' ' . ($value['street_number'] ?? '');
        $name = trim(implode(', ', array_filter([
            $streetAddress,
            ($value['post_code'] ?? '') . ' ' . ($value['city'] ?? ''),
            ($value['country'] ?? '')
        ])));
        if (is_string($value['address'] ?? null) && trim($value['address']) !== '') {
            $name = $value['address'];
        }

        $postalAddress = Schema::postalAddress();
        $postalAddress->addressCountry($value['country'] ?? null);
        $postalAddress->addressLocality($value['address_locality'] ?? $value['city'] ?? null);
        $postalAddress->streetAddress(!empty(trim($streetAddress)) ? $streetAddress : null);
        $postalAddress->postalCode($value['post_code'] ?? null);
        $postalAddress->addressRegion($value['state'] ?? null);
        $postalAddress->name($name);
        $postalAddress->toArray();

        $place = Schema::place();
        $place->latitude($value['lat'] ?? null);
        $place->longitude($value['lng'] ?? null);
        $place->address($postalAddress);
        $place->name($name);

        $place->toArray();

        return $place;
    }

    private function retrieveValuesFileField(array $field): array
    {
        $values = [];

        if (empty($field['value'])) {
            return $values;
        }

        if (!is_array($field['value'])) {
            $field['value'] = [$field['value']];
        }

        foreach ($field['value'] as $imageId) {
            $attachment = $this->wpService->wpPrepareAttachmentForJs($imageId);

            $values[] = [
                'id' => $imageId,
                'url' => $attachment['url'],
                'type' => $attachment['mime'] ?? 'image/jpeg',
                'size' => $attachment['filesizeInBytes'] ?? "0",
                'name' => $attachment['filename'] ?? '',
            ];
        }

        return $values;
    }

    /**
     * Adds a filter to ACF taxonomy fields to always return IDs
     */
    private function filterReturnTypeSetting(): void
    {
        $this->wpService->addFilter('acf/load_field', function ($field) {
            switch ($field['type']) {
                case 'taxonomy':
                    $field['return_format'] = GetReturnTypeEnum::ID->value;
                    break;
                default:
                    return $field;
            }
            return $field;
        });
    }

    /**
     * Prepend the post title and configured post content to the field data
     *
     * @param array $fieldData The field data
     * @param int $postId The post ID
     *
     * @param int $moduleId The form module ID
     * @return array The field data with standard post fields prepended
     */
    private function prependPostFieldsToFieldData(array $fieldData, int $postId, int $moduleId): array
    {
        $post = $this->wpService->getPost($postId);
        $postFields = ['post_title' => $post->post_title ?? null];

        // Extra response fields cause the frontend populator to reject the data.
        if (in_array('editor', $this->getModuleConfigInstance($moduleId)->getDynamicPostFeatures(), true)) {
            $postFields['post_content'] = $post->post_content ?? '';
        }

        return $postFields + $fieldData;
    }

    /**
     * Translates field names to field keys
     *
     * @param int $postId The post ID
     * @param array $fields The fields to translate
     *
     * @return array The translated fields
     */
    private function translateFieldNamesToFieldKeys(int $postId, array $fields): array
    {
        $translatedFields = [];
        foreach ($fields as $key => $fieldValue) {
            $translatedFields[$this->translateFieldNameToFieldKey($postId, $key)] = $fieldValue;
        }
        return $translatedFields;
    }

    /**
     * Translates a field name to a field key
     *
     * @param int $postId The post ID
     * @param string $fieldName The field name to translate
     *
     * @return string The translated field key
     */
    private function translateFieldNameToFieldKey(int $postId, string $fieldName): string
    {
        return $this->wpService->getPostMeta($postId, "_" . $fieldName, true) ?? $fieldName;
    }

    /**
     * Removes fields that are not registered in any of the field groups mapped to the post type.
     * 
     * @param array $fieldKeys The fields to check
     * @param string $postType The post type to check against
     * @param array $defaultKeys The default keys to include, if any.
     */
    private function filterUnmappedFieldKeysForPostType(int $postId, $fieldData): array
    {
        $fieldKeysRegisteredAsFormFields = $this->getModuleConfigInstance($postId)->getFieldKeysRegisteredAsFormFields();

        $fieldData = array_intersect_key(
            $fieldData,
            array_flip($fieldKeysRegisteredAsFormFields)
        );

        return $fieldData;
    }
}
