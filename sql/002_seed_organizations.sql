INSERT INTO organization_profiles (
  name,
  entity_type,
  mission,
  geographies,
  focus_areas,
  tax_status
)
VALUES
  (
    'Mylan Park Foundation',
    'nonprofit',
    'Expands community access to recreation, wellness, and regional events through Mylan Park programming and capital support.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'North Central West Virginia'],
    ARRAY['youth development', 'health', 'recreation', 'community development'],
    '501(c)(3)'
  ),
  (
    'Morgantown Area Youth Services Project',
    'nonprofit',
    'Provides emergency shelter, transitional housing, and supportive services for youth and families facing homelessness and instability.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV'],
    ARRAY['homelessness', 'youth services', 'housing stability', 'mental health'],
    '501(c)(3)'
  ),
  (
    'Mon River Trails Conservancy',
    'nonprofit',
    'Builds, maintains, and promotes trail access and outdoor recreation assets throughout the Morgantown region.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'Marion County, WV'],
    ARRAY['conservation', 'outdoor recreation', 'public access', 'environment'],
    '501(c)(3)'
  ),
  (
    'Empty Bowls Monongalia',
    'nonprofit',
    'Mobilizes volunteers and community events to raise funds and awareness for hunger relief in Monongalia County.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV'],
    ARRAY['food security', 'basic needs', 'community engagement'],
    '501(c)(3)'
  ),
  (
    'United Way of Monongalia and Preston Counties',
    'nonprofit',
    'Invests in local nonprofits and collaborative initiatives that improve health, education, and financial stability.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'Preston County, WV'],
    ARRAY['education', 'health', 'financial stability', 'capacity building'],
    '501(c)(3)'
  );
