<?php

namespace ModularityFrontendForm\DataProcessor\Validators;

use AcfService\AcfService;
use ModularityFrontendForm\Config\ConfigInterface;
use ModularityFrontendForm\Config\ModuleConfigInterface;
use ModularityFrontendForm\DataProcessor\Validators\Result\ValidationResult;
use ModularityFrontendForm\DataProcessor\Validators\Result\ValidationResultInterface;
use WpService\WpService;
use WP_Error;
use WP_REST_Request;
use ModularityFrontendForm\Api\RestApiResponseStatusEnums;

/** Allow domain plugins to validate related fields before any handler runs. */
class ExtensionValidation implements ValidatorInterface
{
    public function __construct(
        private WpService $wpService,
        private AcfService $acfService,
        private ConfigInterface $config,
        private ModuleConfigInterface $moduleConfig,
        private ValidationResultInterface $result = new ValidationResult()
    ) {}

    public function validate(array $data, WP_REST_Request $request): ?ValidationResultInterface
    {
        $valid = $this->wpService->applyFilters(
            'ModularityFrontendForm/validateSubmission', true, $data, $request, $this->moduleConfig, $this->config
        );
        if ($valid instanceof WP_Error) {
            $details = $valid->get_error_data();
            $this->result->setError(new WP_Error(
                RestApiResponseStatusEnums::ValidationError->value,
                $valid->get_error_message(),
                (is_array($details) ? $details : []) + ['status' => 400, 'reason' => $valid->get_error_code()]
            ));
        }
        return $this->result;
    }
}
