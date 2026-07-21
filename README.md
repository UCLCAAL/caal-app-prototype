# CAAL Web

A multilingual web platform for archaeological data management, spatial exploration, and cross-project discovery.

## Overview

CAAL Web is the primary web application developed for the **Central Asian Archaeological Landscapes (CAAL)** project. It provides a unified platform for managing archaeological resources, supporting collaborative data entry, quality assurance, spatial visualisation, and public or partner-facing discovery.

The system has been designed around a PostgreSQL/PostGIS backend and supports multiple archaeological resource types, multilingual controlled vocabularies, and workspace-based permissions.

## Features

### Data Management

* Create, edit and review archaeological records through browser-based interfaces
* Support for multiple resource types, including monuments, archive records, datasets, cartography and remote sensing resources
* Workspace-aware editing with role-based permissions
* Automatic identifier allocation
* Edit history and audit logging
* Relationship management between resources
* Validation and controlled vocabularies

### Mapping

* Interactive MapLibre webGIS
* Spatial search and filtering
* Polygon-based spatial queries
* Map-based editing tools
* Linked map and results interface

### Search and Discovery

* Global search across heterogeneous resource types
* Advanced filtering
* Related resource navigation
* Multilingual searching
* Permission-aware search results
* Integrated Viewer for read-only exploration

### Multilingual Support

Interface translations currently support:

* English
* Russian
* Chinese
* Kazakh
* Kyrgyz
* Tajik
* Turkmen
* Uzbek

Additional languages can be added without changing the application architecture.

## Architecture

CAAL Web separates operational data storage from discovery.

Each archaeological resource type is transformed into a normalised read-only interchange view that exposes a common structure for searching, mapping and visualisation while leaving the underlying source tables unchanged.


Operational database tables
        │
Normalisation layer
        │
Read-only interchange views
        │
        |-─ Data entry interfaces
        | ─ Search
        | ─ Mapping
          ─ Viewer


This approach allows heterogeneous databases to appear as a unified archaeological information system while preserving the underlying data models.

## Controlled Vocabularies

CAAL Web uses multilingual controlled vocabularies for archaeological concepts.

The current implementation supports:

* hierarchical concepts
* multilingual preferred labels
* normalised search layers
* efficient concept resolution

Future work will introduce explicit concept alignment between independent vocabularies using SKOS-compatible mappings, allowing projects to retain local terminology while supporting cross-project discovery.

## Technology Stack

* JavaScript
* Node.js
* Express
* PostgreSQL
* PostGIS
* MapLibre GL JS

## Current Development

Current capabilities include:

* browser-based archaeological data entry
* workspace-based permissions
* multilingual user interface
* integrated mapping
* global search
* relationship management
* read-only Viewer
* spatial filtering
* audit logging
* materialised-view search optimisation

Planned development includes:

* expanded spatial analysis tools
* public discovery interfaces
* exploration of cross-project federation and semantic vocabulary alignment

## Research Context

In addition to supporting day-to-day archaeological data management for the CAAL project, the platform serves as a research testbed for interoperability between archaeological information systems, multilingual knowledge organisation, and large-scale archaeological data federation.

## Licence

Licence information will be added.

## Citation

If you use CAAL Web in research, presentations or publications, please cite the software.

Formal citation information will be provided following the first stable public release.

## Authors

Lead developer

- Christine Spencer
  UCL Institute of Archaeology

Contributors

- Bryan Alvey
- Marco Nebbia
UCL Institute of Archaeology
