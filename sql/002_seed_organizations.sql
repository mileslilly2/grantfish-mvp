-- Ensure UUID generation works
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "Organization" (
  id,
  name,
  "entityType",
  mission,
  geographies,
  "focusAreas",
  "taxStatus"
)
VALUES
  (
    gen_random_uuid(),
    'Mylan Park Foundation',
    'nonprofit',
    'Expands community access to recreation, wellness, and regional events through Mylan Park programming and capital support.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'North Central West Virginia'],
    ARRAY['youth development', 'health', 'recreation', 'community development'],
    '501(c)(3)'
  ),
  (
    gen_random_uuid(),
    'Morgantown Area Youth Services Project',
    'nonprofit',
    'Provides emergency shelter, transitional housing, and supportive services for youth and families facing homelessness and instability.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV'],
    ARRAY['homelessness', 'youth services', 'housing stability', 'mental health'],
    '501(c)(3)'
  ),
  (
    gen_random_uuid(),
    'Mon River Trails Conservancy',
    'nonprofit',
    'Builds, maintains, and promotes trail access and outdoor recreation assets throughout the Morgantown region.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'Marion County, WV'],
    ARRAY['conservation', 'outdoor recreation', 'public access', 'environment'],
    '501(c)(3)'
  ),
  (
    gen_random_uuid(),
    'Empty Bowls Monongalia',
    'nonprofit',
    'Mobilizes volunteers and community events to raise funds and awareness for hunger relief in Monongalia County.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV'],
    ARRAY['food security', 'basic needs', 'community engagement'],
    '501(c)(3)'
  ),
  (
    gen_random_uuid(),
    'United Way of Monongalia and Preston Counties',
    'nonprofit',
    'Invests in local nonprofits and collaborative initiatives that improve health, education, and financial stability.',
    ARRAY['Morgantown, WV', 'Monongalia County, WV', 'Preston County, WV'],
    ARRAY['education', 'health', 'financial stability', 'capacity building'],
    '501(c)(3)'
  );