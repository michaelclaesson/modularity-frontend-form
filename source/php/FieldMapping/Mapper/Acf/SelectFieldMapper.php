<?php

namespace ModularityFrontendForm\FieldMapping\Mapper\Acf;

use ModularityFrontendForm\FieldMapping\Mapper\Interfaces\FieldMapperInterface;
use ModularityFrontendForm\FieldMapping\Mapper\Traits\FieldMapperConstruct;
use ModularityFrontendForm\FieldMapping\Mapper\Traits\FieldMapperGetInstance;

class SelectFieldMapper implements FieldMapperInterface
{
    use FieldMapperConstruct;
    use FieldMapperGetInstance;

    public function map(): array
    {
        $mapped = (new BasicFieldMapper($this->field, $this->lang, 'select'))->map();

        $mapped['options']     = $this->field['choices'] ?: [];
        $mapped['preselected'] = $this->field['default_value'] ?? null;
        $mapped['placeholder'] = $this->field['placeholder']  ?? '';
        $mapped['search'] = !empty($this->field['frontend_form_linked_location']);
        $mapped['multiple']    = $this->field['multiple'] ?? false;
        $mapped['fieldAttributeList']['data-js-validation-message-value-missing'] = $this->lang->errorSelect;

        return $mapped;
    }
}