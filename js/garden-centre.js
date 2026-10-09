// Plants commonly stocked by UK garden centres and nurseries, beyond the hand-written profiles in plants.js.
// One line each: name | latin | type | habit | form | height m | spread m | RHS H | sun | soil | moisture | flowering months | flower | foliage
// sun: F full, P part, S shade · soil: c clay, l loam, s sand, k chalk · moisture: d dry, m moist, w wet · months 1–12, ranges like 6-9.
const DATA = `
Abelia 'Kaleidoscope'|Abelia × grandiflora 'Kaleidoscope'|Shrub|semi|mound|0.8|1|4|FP|clsk|m|7-10|#f2ece0|#c8b444
Acanthus|Acanthus mollis|Perennial|herbaceous|spire|1.5|0.9|5|FP|clsk|dm|6-8|#d9c6d6|#3f5e33
Agapanthus 'Blue Giant'|Agapanthus 'Blue Giant'|Perennial|herbaceous|upright|1|0.6|4|F|lsk|m|7-8|#3d5bb5|#4d7a3a
Ajuga 'Catlin's Giant'|Ajuga reptans 'Catlin's Giant'|Perennial|evergreen|ground|0.2|0.6|7|PS|clsk|m|4-6|#4a50b0|#4f2c4a
Allium 'Globemaster'|Allium 'Globemaster'|Bulb|bulb|bulbs|0.9|0.2|5|F|lsk|dm|5-6|#8c5cc0|#6f8a5a
Anemone blanda|Anemone blanda|Bulb|bulb|bulbs|0.15|0.15|5|FP|lsk|m|2-4|#6a7fd6|#5f7d45
Aquilegia vulgaris|Aquilegia vulgaris|Perennial|herbaceous|upright|0.7|0.45|7|FP|clsk|m|5-6|#7d5fa8|#7d93a0
Armeria maritima|Armeria maritima|Perennial|evergreen|ground|0.2|0.3|7|F|lsk|d|5-7|#e08bb0|#5f7d45
Aster 'Mönch'|Aster × frikartii 'Mönch'|Perennial|herbaceous|mound|0.7|0.4|5|FP|clsk|m|7-10|#8f8fd8|#4f6b3a
Astilbe 'Fanal'|Astilbe × arendsii 'Fanal'|Perennial|herbaceous|upright|0.6|0.45|7|PS|cl|mw|6-8|#b5203a|#3f5a33
Aucuba 'Crotonifolia'|Aucuba japonica 'Crotonifolia'|Shrub|evergreen|mound|2.5|2.5|5|PS|clsk|dm|3-4|#7a3a3a|#6a8a3a
Azalea (evergreen)|Rhododendron (Japanese azalea)|Shrub|evergreen|mound|1|1|5|PS|ls|m|4-5|#e05a8a|#3f5a33
Bamboo (clump-forming)|Fargesia murielae|Grass|evergreen|spiky|3|1.5|6|FP|cls|m||#b8cf6a|#7fa04a
Bay|Laurus nobilis|Shrub|evergreen|column|8|4|4|FP|lsk|m|3-4|#e8dc8a|#3f5a33
Berberis 'Atropurpurea Nana'|Berberis thunbergii f. atropurpurea 'Atropurpurea Nana'|Shrub|deciduous|ball|0.6|0.75|7|FP|clsk|dm|4-5|#e8c24a|#6b2a33
Betula utilis 'Jacquemontii'|Betula utilis subsp. jacquemontii|Small tree|deciduous|tree|12|6|7|FP|cls|m|3-4|#c9b56a|#5f7d45
Blueberry|Vaccinium corymbosum|Fruit|deciduous|mound|1.5|1.5|7|FP|ls|m|4-5|#f6efe6|#4f7038
Box (clipped ball)|Buxus sempervirens|Shrub|evergreen|ball|0.6|0.6|6|FPS|clsk|m||#d8d07a|#2f4a2c
Buddleja 'Buzz'|Buddleja davidii 'Buzz'|Shrub|deciduous|mound|1.2|1|6|F|clsk|dm|7-10|#7a4ab0|#7d8f7a
Calendula|Calendula officinalis|Annual|herbaceous|mound|0.5|0.4|6|F|lsk|m|6-10|#f08a1a|#6d8a4a
Camellia japonica|Camellia japonica|Shrub|evergreen|mound|3|2|5|PS|ls|m|2-4|#d83a5a|#2f4a2c
Campanula 'Kent Belle'|Campanula 'Kent Belle'|Perennial|herbaceous|upright|1|0.5|7|FP|clsk|m|6-8|#5a3a9a|#4f6b3a
Campanula portenschlagiana|Campanula portenschlagiana|Perennial|evergreen|ground|0.15|0.5|5|FP|clsk|dm|6-9|#7a7ad8|#5f7d45
Catalpa 'Aurea'|Catalpa bignonioides 'Aurea'|Tree|deciduous|tree|8|8|6|F|clsk|m|7|#f6f0e6|#d8d04a
Ceanothus 'Concha'|Ceanothus 'Concha'|Shrub|evergreen|mound|2.5|2.5|4|F|lsk|d|5-6|#3a50b0|#2f4a2c
Ceratostigma willmottianum|Ceratostigma willmottianum|Shrub|deciduous|mound|1|1.5|5|F|lsk|d|7-10|#3a60c0|#6f8a46
Cherry 'Amanogawa'|Prunus 'Amanogawa'|Small tree|deciduous|column|6|2|6|F|clsk|m|4-5|#f6c8d4|#5f7d45
Cherry 'Kanzan'|Prunus 'Kanzan'|Tree|deciduous|tree|9|8|6|F|clsk|m|4|#f0a0bc|#5f7d45
Chionodoxa|Scilla forbesii|Bulb|bulb|bulbs|0.15|0.05|5|FP|lsk|m|3-4|#7a9ae0|#5f7d45
Choisya 'Sundance'|Choisya ternata 'Sundance'|Shrub|evergreen|mound|1.5|1.5|4|FP|clsk|m|4-5|#f6f3ea|#d8d04a
Cistus × purpureus|Cistus × purpureus|Shrub|evergreen|mound|1|1|4|F|lsk|d|6-7|#d0508a|#5f6e4a
Clematis armandii|Clematis armandii|Climber|evergreen|climber|5|3|4|FP|clsk|m|3-4|#f6f3ea|#2f4a2c
Clematis montana var. rubens|Clematis montana var. rubens|Climber|deciduous|climber|10|3|6|FP|clsk|m|5-6|#f0b8d0|#5a4a3a
Clematis 'Nelly Moser'|Clematis 'Nelly Moser'|Climber|deciduous|climber|3|1|6|PS|clsk|m|5-6,8-9|#e8a8c8|#4f7038
Convolvulus cneorum|Convolvulus cneorum|Shrub|evergreen|mound|0.6|0.9|4|F|lsk|d|5-8|#f8f6ee|#c8ccc0
Coreopsis 'Moonbeam'|Coreopsis verticillata 'Moonbeam'|Perennial|herbaceous|mound|0.5|0.45|7|F|lsk|d|6-9|#f2e48a|#5f7d45
Cornus alba 'Sibirica'|Cornus alba 'Sibirica'|Shrub|deciduous|upright|2|2|7|FP|clsk|mw|5-6|#f2eedc|#5f7d45
Cornus kousa|Cornus kousa var. chinensis|Small tree|deciduous|tree|7|5|6|FP|cls|m|6|#f6f2e6|#5f7d45
Cosmos|Cosmos bipinnatus|Annual|herbaceous|airy|1.2|0.5|3|F|lsk|m|6-10|#e88ab8|#7da04a
Cotinus 'Royal Purple'|Cotinus coggygria 'Royal Purple'|Shrub|deciduous|mound|3|3|5|F|clsk|m|6-7|#c8a0a8|#5a2533
Cotoneaster horizontalis|Cotoneaster horizontalis|Shrub|deciduous|ground|1|1.5|6|FPS|clsk|d|5-6|#f0d0d0|#3f5a33
Crab apple 'John Downie'|Malus 'John Downie'|Small tree|deciduous|tree|7|5|6|FP|clsk|m|4-5|#f8ecec|#557a3a
Crocosmia 'Emberglow'|Crocosmia 'Emberglow'|Perennial|herbaceous|spiky|0.75|0.3|5|FP|cls|m|7-9|#c83a2a|#557a3c
Cyclamen coum|Cyclamen coum|Tuber|bulb|ground|0.08|0.1|5|PS|lsk|m|1-3|#d84a8a|#3f5a33
Dahlia 'Bishop of Llandaff'|Dahlia 'Bishop of Llandaff'|Tuber|herbaceous|upright|1|0.45|3|F|clsk|m|7-10|#c8202a|#3a2a2a
Daphne 'Eternal Fragrance'|Daphne × transatlantica 'Eternal Fragrance'|Shrub|semi|mound|0.8|0.8|5|FP|lsk|m|4-10|#f6e6ec|#4f7038
Delphinium 'Pacific Giants'|Delphinium elatum (Pacific Giants)|Perennial|herbaceous|spire|1.8|0.6|6|F|clsk|m|6-7|#3a5ac0|#4f6b3a
Deschampsia cespitosa|Deschampsia cespitosa|Grass|evergreen|grass|1|0.8|6|FPS|cls|mw|6-8|#c8b878|#3f5a33
Dianthus 'Doris'|Dianthus 'Doris'|Perennial|evergreen|ground|0.3|0.3|5|F|lsk|d|6-9|#f0b0b8|#9aaab0
Dicentra spectabilis|Lamprocapnos spectabilis|Perennial|herbaceous|mound|0.6|0.45|7|PS|clsk|m|4-6|#e04a7a|#7d9a6a
Echinops ritro|Echinops ritro|Perennial|herbaceous|upright|0.6|0.45|7|F|lsk|d|7-9|#5a7ad0|#8a9a8a
Elaeagnus 'Gilt Edge'|Elaeagnus × ebbingei 'Gilt Edge'|Shrub|evergreen|mound|3|3|6|FP|clsk|dm|10-11|#f2ecd8|#c8b444
Eryngium 'Big Blue'|Eryngium × zabelii 'Big Blue'|Perennial|herbaceous|upright|0.75|0.6|5|F|lsk|d|6-8|#5a7ac0|#8aa0b0
Escallonia 'Apple Blossom'|Escallonia 'Apple Blossom'|Shrub|evergreen|mound|1.5|1.5|4|F|clsk|dm|6-9|#f2c0c8|#2f4a2c
Euonymus 'Emerald 'n' Gold'|Euonymus fortunei 'Emerald 'n' Gold'|Shrub|evergreen|ground|0.6|1.5|5|FPS|clsk|dm||#e8e0a0|#b8c050
Euphorbia amygdaloides var. robbiae|Euphorbia amygdaloides var. robbiae|Perennial|evergreen|mound|0.6|0.6|7|PS|clsk|dm|4-6|#c9d655|#2f4a2c
Fatsia japonica|Fatsia japonica|Shrub|evergreen|mound|3|3|5|PS|clsk|m|10-11|#f2ecd0|#2f5a2c
Fennel (bronze)|Foeniculum vulgare 'Purpureum'|Perennial|herbaceous|airy|1.8|0.45|5|F|lsk|d|7-9|#d8c840|#6a4a3a
Festuca glauca|Festuca glauca|Grass|evergreen|grass|0.3|0.3|5|F|lsk|d|6-7|#c8c098|#8aa8b8
Forsythia|Forsythia × intermedia|Shrub|deciduous|upright|2.5|2.5|7|FP|clsk|m|3-4|#f2d02a|#5f7d45
Fuchsia magellanica|Fuchsia magellanica|Shrub|deciduous|mound|1.5|1.5|5|FP|clsk|m|7-10|#c82a4a|#4f7038
Fuchsia 'Mrs Popple'|Fuchsia 'Mrs Popple'|Shrub|deciduous|mound|1|1|5|FP|clsk|m|6-10|#c8203a|#4f7038
Gaura 'Whirling Butterflies'|Oenothera lindheimeri 'Whirling Butterflies'|Perennial|herbaceous|airy|0.8|0.8|4|F|lsk|d|6-10|#f6f0f0|#5f7d45
Geranium 'Johnson's Blue'|Geranium 'Johnson's Blue'|Perennial|herbaceous|mound|0.45|0.75|7|FP|clsk|m|5-7|#6a80d0|#5f7d45
Geranium phaeum|Geranium phaeum|Perennial|herbaceous|mound|0.8|0.45|7|PS|clsk|dm|5-6|#4a2a4a|#5f7d45
Geum 'Mrs J. Bradshaw'|Geum 'Mrs J. Bradshaw'|Perennial|herbaceous|mound|0.6|0.45|7|FP|clsk|m|5-8|#d8402a|#5f7d45
Ginkgo|Ginkgo biloba|Tree|deciduous|column|20|8|7|FP|clsk|m||#d8d070|#7da04a
Griselinia littoralis|Griselinia littoralis|Shrub|evergreen|mound|3|2|4|FP|clsk|m||#c8c890|#9ac050
Hebe 'Great Orme'|Hebe 'Great Orme'|Shrub|evergreen|mound|1.2|1.2|4|FP|clsk|m|5-9|#e8a0c0|#4f7038
Hebe 'Red Edge'|Hebe 'Red Edge'|Shrub|evergreen|ball|0.45|0.6|5|FP|clsk|dm|6-7|#e0dcf0|#9aaab0
Helenium 'Moerheim Beauty'|Helenium 'Moerheim Beauty'|Perennial|herbaceous|upright|0.9|0.6|7|F|clsk|m|7-9|#b8402a|#4f6b3a
Helianthemum 'Wisley Primrose'|Helianthemum 'Wisley Primrose'|Shrub|evergreen|ground|0.25|0.45|5|F|lsk|d|5-7|#f2e070|#8aa08a
Hellebore 'Christmas Rose'|Helleborus niger|Perennial|evergreen|mound|0.3|0.45|5|PS|clk|m|12-3|#f8f6ee|#2f4a2c
Hemerocallis 'Stella de Oro'|Hemerocallis 'Stella de Oro'|Perennial|herbaceous|spiky|0.3|0.45|6|FP|clsk|m|6-9|#f2c02a|#5f7d45
Heuchera 'Lime Marmalade'|Heuchera 'Lime Marmalade'|Perennial|evergreen|mound|0.3|0.45|5|PS|clsk|m|5-6|#f2ecd8|#c8d050
Holly 'J.C. van Tol'|Ilex aquifolium 'J.C. van Tol'|Shrub|evergreen|column|6|4|6|FPS|clsk|m|5|#f6f2e6|#2a4a2a
Honeysuckle (evergreen)|Lonicera japonica 'Halliana'|Climber|evergreen|climber|8|3|5|FP|clsk|m|6-9|#f6eec8|#3f5a33
Hornbeam (hedge)|Carpinus betulus|Hedge|deciduous|column|2|0.6|7|FPS|clsk|m||#c8c890|#5f7d45
Hosta 'Sum and Substance'|Hosta 'Sum and Substance'|Perennial|herbaceous|mound|0.75|1.5|7|PS|clk|mw|7-8|#e8e0f0|#c8d050
Hydrangea macrophylla|Hydrangea macrophylla|Shrub|deciduous|mound|1.5|1.5|5|PS|clsk|m|7-9|#7a9ae0|#4f7038
Hydrangea quercifolia|Hydrangea quercifolia|Shrub|deciduous|mound|2|2.5|5|PS|cls|m|7-9|#f6f2e6|#4f7038
Hypericum 'Hidcote'|Hypericum 'Hidcote'|Shrub|semi|mound|1.2|1.5|6|FP|clsk|dm|7-10|#f2c82a|#4f7038
Iris germanica|Iris germanica|Perennial|herbaceous|spiky|0.9|0.45|7|F|lsk|d|5-6|#5a4ab0|#8aa0a8
Iris reticulata|Iris reticulata|Bulb|bulb|bulbs|0.15|0.05|5|F|lsk|d|2-3|#4a3ab0|#5f7d45
Jasminum nudiflorum|Jasminum nudiflorum|Climber|deciduous|climber|3|3|6|FPS|clsk|m|11-3|#f2d02a|#3f6a33
Jasminum officinale|Jasminum officinale|Climber|deciduous|climber|8|3|4|FP|clsk|m|6-9|#fbfaf3|#3f5a33
Juniperus 'Blue Star'|Juniperus squamata 'Blue Star'|Conifer|evergreen|mound|0.4|0.8|7|F|clsk|d||#9ab0c0|#8aa8b8
Kniphofia 'Royal Standard'|Kniphofia 'Royal Standard'|Perennial|herbaceous|spire|1|0.6|5|F|lsk|m|7-9|#e8602a|#5f7d45
Lamium 'White Nancy'|Lamium maculatum 'White Nancy'|Perennial|semi|ground|0.15|1|7|PS|clsk|dm|5-7|#f6f6f0|#c0c8c0
Lavandula stoechas|Lavandula stoechas|Shrub|evergreen|mound|0.6|0.6|4|F|ls|d|5-7|#6a3a9a|#8a9a8a
Lavatera 'Barnsley'|Malva 'Barnsley'|Shrub|semi|mound|2|2|5|F|lsk|d|6-9|#f2d0dc|#7d8f7a
Leucanthemum 'Becky'|Leucanthemum × superbum 'Becky'|Perennial|herbaceous|upright|1|0.6|7|F|clsk|m|7-9|#f8f6ee|#3f5e33
Leyland cypress|× Cuprocyparis leylandii|Conifer|evergreen|column|20|5|6|FP|clsk|dm||#9ab070|#3d5a2f
Liatris spicata|Liatris spicata|Perennial|herbaceous|spire|0.6|0.45|5|F|ls|m|8-9|#a84ab0|#5f7d45
Libertia grandiflora|Libertia grandiflora|Perennial|evergreen|spiky|0.9|0.6|4|FP|ls|m|5-6|#f6f6f0|#4f6b3a
Ligularia 'The Rocket'|Ligularia przewalskii 'The Rocket'|Perennial|herbaceous|spire|1.8|1|7|PS|cl|w|7-8|#f2c02a|#3f5a33
Garden privet|Ligustrum ovalifolium|Hedge|semi|column|2|0.6|6|FPS|clsk|dm|7|#f6f2e6|#3f6a33
Lilac|Syringa vulgaris|Shrub|deciduous|upright|4|3|7|F|clsk|m|5|#a880c8|#4f7038
Lily 'Regale'|Lilium regale|Bulb|bulb|bulbs|1.5|0.2|6|F|lsk|m|7|#f8f6ee|#5f7d45
Lobelia (bedding)|Lobelia erinus|Annual|herbaceous|ground|0.15|0.2|2|FP|lsk|m|6-9|#3a50c0|#4f7038
Lonicera nitida 'Baggesen's Gold'|Lonicera nitida 'Baggesen's Gold'|Shrub|evergreen|mound|1.5|1.5|6|FP|clsk|dm||#e8e0a0|#d0c84a
Lupin 'Gallery'|Lupinus (Gallery Series)|Perennial|herbaceous|spire|0.6|0.45|6|FP|ls|m|6-7|#8a5ac0|#5f7d45
Lysimachia clethroides|Lysimachia clethroides|Perennial|herbaceous|upright|0.9|0.6|7|FP|cl|mw|7-9|#f6f6f0|#4f6b3a
Magnolia stellata|Magnolia stellata|Shrub|deciduous|mound|3|4|6|FP|cls|m|3-4|#f8f6f0|#5f7d45
Magnolia 'Susan'|Magnolia 'Susan'|Shrub|deciduous|upright|3|2.5|6|FP|cls|m|4-5|#a83a7a|#5f7d45
Mahonia 'Charity'|Mahonia × media 'Charity'|Shrub|evergreen|upright|4|3|5|PS|clsk|dm|11-2|#f2d02a|#2f4a2c
Miscanthus 'Morning Light'|Miscanthus sinensis 'Morning Light'|Grass|herbaceous|grass|1.5|1|6|F|clsk|m|9-10|#d0b8a8|#a8b890
Molinia 'Transparent'|Molinia caerulea subsp. arundinacea 'Transparent'|Grass|herbaceous|grass|2|0.6|7|FP|cls|m|7-9|#c8b080|#5f7d45
Monarda 'Cambridge Scarlet'|Monarda 'Cambridge Scarlet'|Perennial|herbaceous|upright|0.9|0.45|7|FP|cl|m|7-9|#c8202a|#4f6b3a
Muscari armeniacum|Muscari armeniacum|Bulb|bulb|bulbs|0.2|0.05|6|FP|clsk|m|3-5|#3a50c0|#5f7d45
Nandina domestica|Nandina domestica|Shrub|evergreen|upright|1.5|1|4|FP|cls|m|6-7|#f6f0e6|#7a8a3a
Nemesia (bedding)|Nemesia strumosa|Annual|herbaceous|ground|0.3|0.2|2|F|ls|m|6-9|#e89ab8|#4f7038
Nerine bowdenii|Nerine bowdenii|Bulb|bulb|bulbs|0.45|0.1|4|F|ls|d|9-11|#f08ab8|#5f7d45
Olive|Olea europaea|Tree|evergreen|tree|4|3|4|F|lsk|d|6|#f2ecd0|#8a9a8a
Ophiopogon 'Nigrescens'|Ophiopogon planiscapus 'Nigrescens'|Perennial|evergreen|grass|0.2|0.3|5|FP|ls|m|7-8|#e8d0e0|#2a2a2a
Osmanthus × burkwoodii|Osmanthus × burkwoodii|Shrub|evergreen|mound|3|3|6|FP|clsk|m|4|#f8f6ee|#2f4a2c
Osteospermum|Osteospermum jucundum|Perennial|evergreen|ground|0.4|0.6|4|F|lsk|d|5-9|#d070b0|#4f7038
Pachysandra terminalis|Pachysandra terminalis|Perennial|evergreen|ground|0.2|0.6|5|PS|cls|m|3-4|#f6f2e6|#3f5a33
Paeonia lactiflora 'Sarah Bernhardt'|Paeonia lactiflora 'Sarah Bernhardt'|Perennial|herbaceous|mound|0.9|0.9|6|FP|clsk|m|5-6|#f4b8c8|#3f5a33
Papaver orientale|Papaver orientale|Perennial|herbaceous|upright|0.9|0.6|7|F|lsk|d|5-6|#e0402a|#6f8a5a
Parthenocissus tricuspidata|Parthenocissus tricuspidata|Climber|deciduous|climber|20|8|5|FPS|clsk|m||#c8c890|#4f7038
Passiflora caerulea|Passiflora caerulea|Climber|semi|climber|8|3|4|F|lsk|m|7-9|#e8e8f0|#3f6a33
Pelargonium (bedding)|Pelargonium (zonal)|Annual|evergreen|mound|0.45|0.3|1|F|ls|d|5-10|#d8303a|#5f7d45
Penstemon 'Garnet'|Penstemon 'Andenken an Friedrich Hahn'|Perennial|semi|upright|0.75|0.6|4|F|lsk|m|7-10|#a82040|#4f7038
Perovskia 'Blue Spire'|Salvia yangii 'Blue Spire'|Shrub|deciduous|upright|1.2|1|5|F|lsk|d|8-10|#7a8ad8|#a8b0b0
Petunia (bedding)|Petunia × hybrida|Annual|herbaceous|ground|0.3|0.4|1|F|ls|m|6-10|#a840a8|#4f7038
Philadelphus 'Manteau d'Hermine'|Philadelphus 'Manteau d'Hermine'|Shrub|deciduous|mound|0.75|1.5|6|FP|clsk|m|6-7|#fbf8ec|#5f8443
Phlomis russeliana|Phlomis russeliana|Perennial|evergreen|upright|0.9|0.75|7|F|lsk|d|5-9|#e8c84a|#7d8f6a
Phlox paniculata|Phlox paniculata|Perennial|herbaceous|upright|1|0.6|7|FP|cl|m|7-9|#d070b0|#4f6b3a
Phormium 'Jester'|Phormium 'Jester'|Perennial|evergreen|spiky|1|1|4|F|clsk|m||#c8a080|#c87a6a
Photinia 'Red Robin'|Photinia × fraseri 'Red Robin'|Shrub|evergreen|mound|4|4|4|FP|clsk|m|4-5|#f6f2e6|#a8303a
Physocarpus 'Diabolo'|Physocarpus opulifolius 'Diabolo'|Shrub|deciduous|mound|2|2|7|FP|cls|m|6|#f2e0e0|#4a2a33
Pieris 'Forest Flame'|Pieris 'Forest Flame'|Shrub|evergreen|mound|2.5|2|5|PS|ls|m|3-4|#f8f6ee|#c8403a
Pittosporum 'Tom Thumb'|Pittosporum tenuifolium 'Tom Thumb'|Shrub|evergreen|ball|1|0.6|4|FP|clsk|m||#5a2a3a|#4a2a33
Polemonium caeruleum|Polemonium caeruleum|Perennial|herbaceous|upright|0.6|0.45|7|FP|clsk|m|5-7|#6a7ad0|#4f7038
Potentilla 'Abbotswood'|Potentilla fruticosa 'Abbotswood'|Shrub|deciduous|mound|0.75|1.2|7|F|clsk|dm|5-9|#f8f6ee|#6f8a5a
Primula (polyanthus)|Primula Polyanthus Group|Perennial|herbaceous|ground|0.2|0.25|6|PS|cl|m|2-5|#e0602a|#5f7d45
Cherry laurel|Prunus laurocerasus|Shrub|evergreen|mound|6|6|5|FPS|clsk|dm|4|#f6f2e6|#2f5a2c
Portugal laurel|Prunus lusitanica|Shrub|evergreen|mound|6|6|5|FPS|clsk|dm|6|#f6f2e6|#2a4a2a
Prunus serrula|Prunus serrula|Small tree|deciduous|tree|8|8|6|FP|clsk|m|4-5|#f8f0ee|#5f7d45
Pulmonaria 'Sissinghurst White'|Pulmonaria 'Sissinghurst White'|Perennial|semi|ground|0.3|0.45|6|PS|clk|m|3-5|#f8f6ee|#5f7d45
Pyracantha 'Saphyr Orange'|Pyracantha 'Saphyr Orange'|Shrub|evergreen|upright|3|2|6|FPS|clsk|dm|6|#f6f2e6|#2f4a2c
Raspberry|Rubus idaeus (cultivated)|Fruit|deciduous|upright|1.8|0.5|6|FP|cl|m|6|#f6f2e6|#5f7d45
Rhododendron 'Cunningham's White'|Rhododendron 'Cunningham's White'|Shrub|evergreen|mound|2.5|2.5|7|PS|ls|m|5|#f8f6f0|#2f4a2c
Rosa 'Gertrude Jekyll'|Rosa 'Gertrude Jekyll' (Ausbord)|Shrub rose|deciduous|mound|1.5|1.2|7|FP|clk|m|6-9|#e86090|#3f5a33
Rosa 'Iceberg'|Rosa 'Iceberg'|Shrub rose|deciduous|mound|1.2|0.9|6|FP|clk|m|6-10|#f8f6f0|#3f5a33
Rosa 'Munstead Wood'|Rosa 'Munstead Wood' (Ausbernard)|Shrub rose|deciduous|mound|1|0.8|7|FP|clk|m|6-9|#7a1a2a|#3f5a33
Rosa 'New Dawn'|Rosa 'New Dawn'|Climber|deciduous|climber|3|2.5|7|FP|clk|m|6-9|#f6d8d8|#3f5c34
Rosa rugosa|Rosa rugosa|Shrub|deciduous|mound|1.5|1.5|7|FP|clsk|dm|6-9|#d03a7a|#4f7038
Rosemary|Salvia rosmarinus|Shrub|evergreen|mound|1.5|1.5|4|F|lsk|d|3-5|#8aa0e0|#5a6a5a
Rudbeckia 'Herbstsonne'|Rudbeckia laciniata 'Herbstsonne'|Perennial|herbaceous|upright|2|0.9|7|FP|clsk|m|8-10|#f2d02a|#4a6636
Salvia 'Hot Lips'|Salvia microphylla 'Hot Lips'|Shrub|semi|mound|0.75|0.75|4|F|lsk|d|6-10|#e03a4a|#4f7038
Salvia 'Amistad'|Salvia 'Amistad'|Perennial|herbaceous|upright|1.2|0.6|3|F|lsk|m|6-11|#4a2a8a|#4f7038
Sambucus 'Black Lace'|Sambucus nigra f. porphyrophylla 'Eva'|Shrub|deciduous|mound|2.5|2.5|6|FP|clsk|m|6|#f0c8d8|#3a2030
Santolina chamaecyparissus|Santolina chamaecyparissus|Shrub|evergreen|ball|0.5|0.6|5|F|lsk|d|7-8|#f2d84a|#b8c0b8
Scabiosa 'Butterfly Blue'|Scabiosa columbaria 'Butterfly Blue'|Perennial|herbaceous|mound|0.4|0.4|7|F|lsk|d|6-9|#8a9ae0|#6f8a5a
Sedum 'Matrona'|Hylotelephium 'Matrona'|Perennial|herbaceous|mound|0.6|0.45|7|F|lsk|d|8-10|#d8a0b0|#6a6a5a
Sedum spurium|Phedimus spurius|Perennial|evergreen|ground|0.1|0.6|7|F|lsk|d|7-8|#e08ab0|#6a8a4a
Sempervivum|Sempervivum tectorum|Perennial|evergreen|ground|0.15|0.5|7|F|lsk|d|7|#e08ab0|#6a8a5a
Skimmia 'Rubella'|Skimmia japonica 'Rubella'|Shrub|evergreen|ball|1|1|7|PS|cls|m|3-4|#f6eee6|#2f4a2c
Snowberry|Symphoricarpos albus|Shrub|deciduous|mound|2|2|7|FPS|clsk|dm|6-8|#f0d0d8|#5f7d45
Solanum crispum 'Glasnevin'|Solanum crispum 'Glasnevin'|Climber|semi|climber|6|4|4|F|clsk|m|7-9|#8a6ac8|#3f6a33
Sorbus 'Joseph Rock'|Sorbus 'Joseph Rock'|Tree|deciduous|tree|10|7|6|FP|cls|m|5|#f6f2e6|#5f7d45
Spiraea 'Goldflame'|Spiraea japonica 'Goldflame'|Shrub|deciduous|mound|0.75|0.75|7|F|clsk|m|6-7|#e070a0|#d8b040
Stachys byzantina|Stachys byzantina|Perennial|evergreen|ground|0.4|0.6|7|F|lsk|d|6-7|#c890c8|#c8ccc8
Stipa gigantea|Celtica gigantea|Grass|evergreen|grass|2.2|1.2|5|F|lsk|d|6-8|#d8b860|#5f7d45
Strawberry|Fragaria × ananassa|Fruit|semi|ground|0.2|0.4|6|F|cl|m|5-6|#f8f6ee|#4f7038
Sweet pea|Lathyrus odoratus|Annual|herbaceous|climber|2|0.4|3|F|clsk|m|6-9|#d888c8|#5f7d45
Tamarix ramosissima|Tamarix ramosissima|Shrub|deciduous|airy|4|4|5|F|ls|dm|8-9|#f0b0c8|#8aa08a
Thalictrum 'Hewitt's Double'|Thalictrum delavayi 'Hewitt's Double'|Perennial|herbaceous|airy|1.2|0.6|7|PS|cl|m|7-9|#b080c8|#7d9a8a
Thyme|Thymus vulgaris|Shrub|evergreen|ground|0.2|0.4|5|F|lsk|d|5-7|#d8a0c8|#6a7a5a
Tiarella cordifolia|Tiarella cordifolia|Perennial|evergreen|ground|0.2|0.5|7|PS|cl|m|4-6|#f6f2ee|#5f7d45
Trachycarpus fortunei|Trachycarpus fortunei|Tree|evergreen|spiky|8|2.5|5|FP|clsk|m|6|#e8d07a|#3f5a33
Tradescantia (Andersoniana)|Tradescantia Andersoniana Group|Perennial|herbaceous|spiky|0.6|0.45|7|FP|clsk|m|6-9|#5a4ab0|#5f7d45
Tulip 'Queen of Night'|Tulipa 'Queen of Night'|Bulb|bulb|bulbs|0.6|0.1|6|F|lsk|m|5|#3a1a2a|#7a8f72
Tulip 'Apricot Beauty'|Tulipa 'Apricot Beauty'|Bulb|bulb|bulbs|0.45|0.1|6|F|lsk|m|4|#f2a080|#7a8f72
Verbascum 'Southern Charm'|Verbascum 'Southern Charm'|Perennial|herbaceous|spire|0.8|0.4|6|F|lsk|d|6-8|#e8c0a8|#8aa08a
Veronica spicata|Veronica spicata|Perennial|herbaceous|spire|0.6|0.45|7|F|lsk|d|6-8|#4a5ab8|#5f7d45
Veronicastrum 'Fascination'|Veronicastrum virginicum 'Fascination'|Perennial|herbaceous|spire|1.5|0.6|7|FP|cl|m|7-9|#b8a0d8|#3f5a33
Viburnum opulus 'Roseum'|Viburnum opulus 'Roseum'|Shrub|deciduous|mound|4|4|6|FP|clsk|mw|5-6|#eef1df|#5f7d45
Viburnum plicatum 'Mariesii'|Viburnum plicatum f. tomentosum 'Mariesii'|Shrub|deciduous|mound|3|4|6|FP|clsk|m|5-6|#f8f6f0|#5f7d45
Vinca minor|Vinca minor|Perennial|evergreen|ground|0.2|1|5|PS|clsk|dm|3-5|#5a6ad0|#2f4a2c
Viola (bedding pansy)|Viola × wittrockiana|Annual|herbaceous|ground|0.2|0.2|5|FP|lsk|m|10-5|#7a4ab0|#4f7038
Weigela 'Florida Variegata'|Weigela 'Florida Variegata'|Shrub|deciduous|mound|2|2|6|FP|clsk|m|5-6|#f0b0c8|#a8b880
Wisteria sinensis|Wisteria sinensis|Climber|deciduous|climber|9|6|6|F|clsk|m|5-6|#a890d8|#5f7d45
Yew (hedge)|Taxus baccata|Hedge|evergreen|column|2|0.6|7|FPS|clsk|dm||#c8c890|#24392a
Yucca filamentosa|Yucca filamentosa|Shrub|evergreen|spiky|0.75|1.5|5|F|lsk|d|7-8|#f6f2e6|#6a8a6a
Zantedeschia aethiopica|Zantedeschia aethiopica|Perennial|herbaceous|spiky|0.9|0.6|4|FP|cl|mw|5-7|#fbfaf3|#3f6a33
Apple (dwarf, M27)|Malus domestica|Fruit|deciduous|tree|2|1.5|6|F|cls|m|4-5|#f8e8e6|#557a3a
Pear|Pyrus communis|Fruit|deciduous|tree|4|3|6|F|cls|m|4|#f8f6f0|#557a3a
Plum 'Victoria'|Prunus domestica 'Victoria'|Fruit|deciduous|tree|4|4|6|F|clsk|m|4|#f8f6f0|#557a3a
Fig 'Brown Turkey'|Ficus carica 'Brown Turkey'|Fruit|deciduous|mound|3|4|4|F|lsk|m||#c8c890|#4f7038
Gooseberry|Ribes uva-crispa|Fruit|deciduous|mound|1.2|1.2|6|FP|clsk|m|4|#d8d0a0|#5f7d45
Mint|Mentha spicata|Perennial|herbaceous|mound|0.6|1|7|FP|cl|mw|7-9|#d8c0e0|#5f8a45
Chives|Allium schoenoprasum|Perennial|herbaceous|grass|0.3|0.3|7|FP|clsk|m|5-6|#c890d0|#5f8a45
Sage (culinary)|Salvia officinalis|Shrub|evergreen|mound|0.6|0.9|5|F|lsk|d|6-7|#8a8ad0|#9aa098
`;

const MONTHS = (text) => {
  const out = new Set();
  for (const part of text.split(",").filter(Boolean)) {
    const [a, b] = part.split("-").map(Number);
    if (!b) { out.add(a - 1); continue; }
    for (let m = a; ; m = (m % 12) + 1) { out.add(m - 1); if (m === b) break; }
  }
  return [...out];
};
const slug = (text) => `gc-${text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export const GARDEN_CENTRE = DATA.trim().split("\n").map((line) => {
  const [name, latin, type, habit, form, h, s, rhs, sun, soil, moist, bloom, flower, foliage] = line.split("|");
  return {
    id: slug(name),
    name, latin, type, habit, form,
    h: Number(h), s: Number(s), rhs: Number(rhs),
    sun: [...sun].map((c) => ({ F: "full", P: "part", S: "shade" })[c]),
    soil: [...soil].map((c) => ({ c: "clay", l: "loam", s: "sand", k: "chalk" })[c]),
    moist: [...moist].map((c) => ({ d: "dry", m: "moist", w: "wet" })[c]),
    bloom: MONTHS(bloom),
    flower: bloom ? flower : null,
    foliage,
    autumn: null, stems: null, fruit: null, leaves: null,
    wildlife: false, scent: false,
    note: "",
    source: "garden-centre"
  };
});
