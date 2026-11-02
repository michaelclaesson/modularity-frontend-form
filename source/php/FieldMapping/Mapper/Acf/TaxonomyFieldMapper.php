<?php

namespace ModularityFrontendForm\FieldMapping\Mapper\Acf;

use ModularityFrontendForm\FieldMapping\Mapper\Interfaces\FieldMapperInterface;
use ModularityFrontendForm\FieldMapping\Mapper\Traits\FieldMapperConstruct;
use ModularityFrontendForm\FieldMapping\Mapper\Traits\FieldMapperGetInstance;
use ModularityFrontendForm\FieldMapping\Mapper\Acf\CheckboxFieldMapper;
use ModularityFrontendForm\FieldMapping\Mapper\Acf\SelectFieldMapper;
use ModularityFrontendForm\FieldMapping\Mapper\Acf\RadioFieldMapper;

class TaxonomyFieldMapper implements FieldMapperInterface
{
    use FieldMapperConstruct;
    use FieldMapperGetInstance;

    private array $mapClasses = [
        'checkbox'     => CheckboxFieldMapper::class,
        'radio'        => RadioFieldMapper::class,
        'select'       => SelectFieldMapper::class,
        'multi_select' => SelectFieldMapper::class,
    ];

    public function map(): array
    {
        $this->field['choices'] = $this->structureTerms(
            $this->getTermsFromTaxonomy($this->field)
        );

        if (!empty($this->field['frontend_form_linked_location'])) {
            $this->field['choices'] = ['' => ($this->field['placeholder'] ?? '')] + $this->field['choices'];
        }

        $type   = $this->field['field_type'] ?? 'select';
        $mapper = $this->mapClasses[$type] ?? SelectFieldMapper::class;

        if ($type === 'multi_select') {
            $this->field['multiple'] = true;
        }

        return (new $mapper($this->field, $this->wpService, $this->lang, $this->config))->map();
    }

    /**
     * Structure terms into a key-value array.
     *
     * @param array $terms The terms to structure.
     * @return array The structured terms.
     */
    private function structureTerms(array $terms): array
    {
        $structured = [];

        foreach ($terms as $term) {
            $label = $term->name ?? $term->term_id;
            if (!empty($this->field['frontend_form_option_label_meta'])) {
                $meta = $this->wpService->getTermMeta($term->term_id, $this->field['frontend_form_option_label_meta'], true);
                $address = is_array($meta) ? $this->shortAddress($meta) : '';
                if ($address !== '') {
                    $label .= ' (' . $address . ')';
                }
            }
            $structured[$term->term_id] = $label;
        }

        return $structured;
    }

    /** Street + number, postcode and city when stored; otherwise the full address. */
    private function shortAddress(array $meta): string
    {
        $street = trim(($meta['street_name'] ?? '') . ' ' . ($meta['street_number'] ?? ''));
        $city   = trim(($meta['post_code'] ?? '') . ' ' . ($meta['address_locality'] ?? $meta['city'] ?? ''));
        if ($street !== '') {
            return implode(', ', array_filter([$street, $city]));
        }
        return is_string($meta['address'] ?? null) ? $meta['address'] : '';
    }

    /**
     * Get terms from the specified taxonomy.
     *
     * @param array $field The field configuration.
     * @return array The terms from the taxonomy.
     */
    private function getTermsFromTaxonomy(array $field): array
    {
        if (empty($field['taxonomy'])) {
            return [];
        }

        $terms = $this->wpService->getTerms([
            'taxonomy'   => $field['taxonomy'],
            'hide_empty' => false,
        ]);

        return $this->wpService->isWpError($terms) ? [] : $terms;
    }
}