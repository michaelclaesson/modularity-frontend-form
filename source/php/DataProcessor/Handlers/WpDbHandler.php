<?php

namespace ModularityFrontendForm\DataProcessor\Handlers;

use WpService\WpService; 
use AcfService\AcfService;
use ModularityFrontendForm\Config\GetModuleConfigInstanceTrait;
use ModularityFrontendForm\Config\ConfigInterface;
use ModularityFrontendForm\Config\ModuleConfigInterface;
use ModularityFrontendForm\DataProcessor\Handlers\Result\HandlerResult;
use ModularityFrontendForm\DataProcessor\Handlers\Result\HandlerResultInterface;
use ModularityFrontendForm\Api\RestApiResponseStatusEnums;
use ModularityFrontendForm\DataProcessor\FileHandlers\NullFileHandler;
use ModularityFrontendForm\DataProcessor\FileHandlers\FileHandlerInterface;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use WP;
use WP_Error;
use WP_REST_Request;

class WpDbHandler implements HandlerInterface {

  use GetModuleConfigInstanceTrait;

  public function __construct(
      private WpService $wpService,
      private AcfService $acfService,
      private ConfigInterface $config,
      private ModuleConfigInterface $moduleConfigInstance,
      private object $params,
      private HandlerResultInterface $handlerResult = new HandlerResult(),
      private LoggerInterface $logger = new NullLogger,
      private ?FileHandlerInterface $fileHandler = null
  ) {
    if($this->fileHandler === null) {
      $this->fileHandler = new NullFileHandler(
        $this->config, 
        $this->moduleConfigInstance, 
        $this->wpService
      );
    }
  }

  /**
   * Handles the request to insert a post in WordPress 
   * database. 
   * 
   * @param array $data The data to insert
   * 
   * @return HandlerResultInterface|null The result of the handler
   */
  public function handle(array $data, WP_REST_Request $request): ?HandlerResultInterface
  {
    [
      'plucked' => [
        'post_title'    => $postTitle, 
        'post_content'  => $postContent
      ], 
      'fieldMeta' => $data
    ] = $this->pluckFromMetaData($data, ['post_title', 'post_content']);

    if(str_ends_with($request->get_route(), '/submit/update') && isset($this->params->postId) && $this->wpService->getPost((int) $this->params->postId) !== null) {
      $this->updatePost(
        $this->moduleConfigInstance->getModuleId(),
        $data,
        $this->params,
        $this->sanitizePostTitle($postTitle),
        $this->sanitizePostContent(
          $postContent, 
          $this->config->getAllowedHtmlTags()
        ),
        $request
      );
    } else {
      $this->insertPost(
        $this->moduleConfigInstance->getModuleId(),
        $data,
        $this->params,
        $this->sanitizePostTitle($postTitle),
        $this->sanitizePostContent(
          $postContent, 
          $this->config->getAllowedHtmlTags()
        ),
        $request
      );
    }

    return $this->handlerResult;
  }

  /**
   * Handles the request to insert a post
   *
   * @param int|null $moduleID The module ID
   * @param array|null $fieldMeta The field meta data
   *
   * @return WP_Error|int The result of the post insertion
   */
  private function insertPost(
    int $moduleID, 
    array|null $fieldMeta, 
    object $params, 
    null|string $postTitle = null, 
    null|string $postContent = null,
    WP_REST_Request $request
  ): false|int {

    $moduleConfig = $this->moduleConfigInstance->getWpDbHandlerConfig();

    $result = $this->wpService->wpInsertPost([
        'post_title'    => $postTitle   ?: $this->moduleConfigInstance->getModuleTitle(),
        'post_content'  => $postContent ?: '',
        'post_type'     => $moduleConfig->saveToPostType,
        'post_status'   => $moduleConfig->saveToPostTypeStatus,
        'post_password' => $this->createPostPassword(),
        'meta_input'    => [
          $this->config->getMetaDataNamespace('holding_post_id') => (
            $params->holdingPostId ?? null
          ),
          $this->config->getMetaDataNamespace('module_id')  => $moduleID,
          $this->config->getMetaDataNamespace('nonce')      => $fieldMeta['nonce'] ?? '',
          $this->config->getMetaDataNamespace('submission') => true
        ],
    ]);

    // Set error 
    if ($this->wpService->isWpError($result)) {
      $this->handlerResult->setError(
        new WP_Error(
          RestApiResponseStatusEnums::HandlerError->value,
          $this->wpService->__('Could not insert post.', 'modularity-frontend-form'),
          [
            'post_type'   => $moduleConfig->saveToPostType,
            'post_status' => $moduleConfig->saveToPostTypeStatus,
            'post_id'     => $result->get_error_data(),
          ]
        )
      );
      return false;
    }

    // Handle file uploads, if error occurs, set error and return false
    $fileHandlerResult = $this->fileHandler->handle($request, $result ?? null);
    if($this->wpService->isWpError($fileHandlerResult)) {
      $this->handlerResult->setError($fileHandlerResult);
      return false;
    }

    // Prepare fields with sideloaded attachments
    $fieldMeta = $this->prepareFieldsWithSideloadedAttachments(
      $fieldMeta, 
      $fileHandlerResult
    );

    //Store fields
    $this->storeFields($fieldMeta, $result);

    $this->wpService->doAction('ModularityFrontendForm/afterInsertPost', $result);

    return true;
  }

  /**
   * Handles the request to update a post
   *
   * @param int|null $moduleID The module ID
   * @param array|null $fieldMeta The field meta data
   *
   * @return WP_Error|int The result of the post update
   */
  private function updatePost(
    int $moduleID, 
    array|null $fieldMeta, 
    object $params, 
    null|string $postTitle = null, 
    null|string $postContent = null,
    WP_REST_Request $request
  ): false|int {

    $moduleConfig = $this->moduleConfigInstance->getWpDbHandlerConfig();

    $result = $this->wpService->wpUpdatePost([
        'ID'           => (int) $params->postId,
        'post_title'   => $postTitle   ?: $this->moduleConfigInstance->getModuleTitle(),
        'post_content' => $postContent ?: '',
        'post_status'  => $moduleConfig->saveToPostTypeStatus,
        'meta_input'   => [
          $this->config->getMetaDataNamespace('holding_post_id') => (
            $params->holdingPostId ?? null
          ),
          $this->config->getMetaDataNamespace('module_id') => $moduleID,
          $this->config->getMetaDataNamespace('nonce')     => $fieldMeta['nonce'] ?? '',
          $this->config->getMetaDataNamespace('submission') => true
        ],
    ]);

    // Set error 
    if ($this->wpService->isWpError($result)) {
      $this->handlerResult->setError(
        new WP_Error(
          RestApiResponseStatusEnums::HandlerError->value,
          $this->wpService->__('Could not update post.', 'modularity-frontend-form'),
          [
            'post_type'   => $moduleConfig->saveToPostType,
            'post_status' => $moduleConfig->saveToPostTypeStatus,
            'post_id'     => $result->get_error_data(),
          ]
        )
      );
      return false;
    }

    // Handle file uploads, if error occurs, set error and return false
    $fileHandlerResult = $this->fileHandler->handle($request, $result ?? null);
    if($this->wpService->isWpError($fileHandlerResult)) {
      $this->handlerResult->setError($fileHandlerResult);
      return false;
    }

    // Prepare fields with sideloaded attachments
    $fieldMeta = $this->prepareFieldsWithSideloadedAttachments(
      $fieldMeta, 
      $fileHandlerResult
    );

    $this->storeFields($fieldMeta, $result);
    $this->wpService->doAction('ModularityFrontendForm/afterUpdatePost', $result);

    return true;
  }

  /**
   * Prepares fields by replacing file fields with sideloaded attachment IDs
   *
   * @param array $fields The fields to prepare
   * @param array $sideloadedAttachments The sideloaded attachments
   * 
   * @return array The prepared fields
   */
  private function prepareFieldsWithSideloadedAttachments(array $fields, array $sideloadedAttachments): array
  {
    $reducedSideloadedAttachments = [];
    foreach ($sideloadedAttachments as $fieldKey => $item) {
      if (isset($item['id'])) {
        $reducedSideloadedAttachments[$fieldKey][] = $item['id'];
      } elseif (is_array($item)) {
        foreach ($item as $subItem) {
          if (isset($subItem['id'])) {
            $reducedSideloadedAttachments[$fieldKey][] = $subItem['id'];
          }
        }
      }
    }

    foreach ($reducedSideloadedAttachments as $fieldKey => $attachmentIds) {
      $fieldObject = $this->acfService->getFieldObject($fieldKey);
      $isImageField = $fieldObject && $fieldObject['type'] === 'image';
      $fields[$fieldKey] = $isImageField ? $attachmentIds[0] ?? null : $attachmentIds;
    }

    return $fields;
  }

  /**
   * Stores the fields in the database
   *
   * @param array $fields The fields to store
   * @param int $postId The ID of the post to store the fields for
   */
  public function storeFields(array $fields, int $postId): bool
  {
    foreach ($fields as $key => $value) {
      if (isset($fields[$key])) {
        $result = $this->acfService->updateField(
            $key, 
            $value, 
            $postId
        );
        if($this->wpService->isWpError($result)) {
          $this->handlerResult->setError(
            new WP_Error(
              RestApiResponseStatusEnums::HandlerError->value,
              $this->wpService->__('Could not update field with metadata.', 'modularity-frontend-form'),
              [
                'field' => $key,
                'post_id' => $postId,
              ]
            )
          );
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Creates a post password
   *
   * @return string The generated password
   */
  private function createPostPassword(): string
  {
    return $this->wpService->wpGeneratePassword(
      32,
      false,
      false
    );
  }

  /**
   * Plucks a value from the meta data array
   *
   * @param array $fieldMeta The field meta data
   * @param string $key The key to pluck
   *
   * @return array The plucked value and the remaining meta data
   */
  /**
   * Plucks one or more values from the meta data array
   *
   * @param array $fieldMeta The field meta data
   * @param array $keys The keys to pluck
   *
   * @return array ['plucked' => array, 'fieldMeta' => array]
   */
  private function pluckFromMetaData(array $fieldMeta, array $keys): array
  {
    $plucked = [];
    foreach ($keys as $key) {
      $plucked[$key] = $fieldMeta[$this->config->getFieldNamespace()][$key] ?? null;
      unset($fieldMeta[$this->config->getFieldNamespace()][$key]);
    }

    return [
      'plucked' => $plucked,
      'fieldMeta' => $fieldMeta[$this->config->getFieldNamespace()] ?? []
    ];
  }

  /**
   * Sanitizes the post title
   *
   * @param string|null $postTitle The post title
   *
   * @return string The sanitized post title
   */  private function sanitizePostTitle(?string $postTitle): string
  {
    return $this->wpService->sanitizeTextField($postTitle ?? '');
  }

  /**
   * Sanitizes the post content
   *
   * @param string|null $postContent The post content
   *
   * @return string The sanitized post content
   */
  private function sanitizePostContent(?string $postContent, null|array $allowedTags = null): string
  {
    if($allowedTags === null || empty($allowedTags)) {
      return $this->wpService->sanitizeTextField($postContent ?? '');
    }
    return $this->wpService->wpKses($postContent ?? '', $allowedTags);
  }
}
