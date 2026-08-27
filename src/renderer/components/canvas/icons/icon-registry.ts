// --------------------------------------------------------------------------
// Icon registry — maps service names to R2 CDN SVG paths
// --------------------------------------------------------------------------

const CDN_BASE = 'https://pub-5eeb5465b11049d699b2b0afb00261be.r2.dev';

// --------------------------------------------------------------------------
// AWS service icon paths
// --------------------------------------------------------------------------

const AWS_ICONS: Record<string, string> = {
  'ec2':              'aws/Compute/Arch_Amazon-EC2_48.svg',
  'lambda':           'aws/Compute/Arch_AWS-Lambda_48.svg',
  'auto scaling':     'aws/Compute/Arch_Amazon-EC2-Auto-Scaling_48.svg',
  's3':               'aws/Storage/Arch_Amazon-Simple-Storage-Service_48.svg',
  'rds':              'aws/Databases/Arch_Amazon-RDS_48.svg',
  'aurora':           'aws/Databases/Arch_Amazon-Aurora_48.svg',
  'dynamodb':         'aws/Databases/Arch_Amazon-DynamoDB_48.svg',
  'elasticache':      'aws/Databases/Arch_Amazon-ElastiCache_48.svg',
  'sqs':              'aws/Application-Integration/Arch_Amazon-Simple-Queue-Service_48.svg',
  'sns':              'aws/Application-Integration/Arch_Amazon-Simple-Notification-Service_48.svg',
  'eventbridge':      'aws/Application-Integration/Arch_Amazon-EventBridge_48.svg',
  'step functions':   'aws/Application-Integration/Arch_AWS-Step-Functions_48.svg',
  'api gateway':      'aws/Networking/Arch_Amazon-API-Gateway_48.svg',
  'cloudfront':       'aws/Networking/Arch_Amazon-CloudFront_48.svg',
  'route53':          'aws/Networking/Arch_Amazon-Route-53_48.svg',
  'route 53':         'aws/Networking/Arch_Amazon-Route-53_48.svg',
  'vpc':              'aws/Networking/Arch_Amazon-Virtual-Private-Cloud_48.svg',
  'alb':              'aws/Networking/Arch_Elastic-Load-Balancing_48.svg',
  'elb':              'aws/Networking/Arch_Elastic-Load-Balancing_48.svg',
  'load balancer':    'aws/Networking/Arch_Elastic-Load-Balancing_48.svg',
  'ecs':              'aws/Containers/Arch_Amazon-Elastic-Container-Service_48.svg',
  'eks':              'aws/Containers/Arch_Amazon-Elastic-Kubernetes-Service_48.svg',
  'fargate':          'aws/Containers/Arch_AWS-Fargate_48.svg',
  'ecr':              'aws/Containers/Arch_Amazon-Elastic-Container-Registry_48.svg',
  'cognito':          'aws/Security-Identity/Arch_Amazon-Cognito_48.svg',
  'iam':              'aws/Security-Identity/Arch_AWS-Identity-and-Access-Management_48.svg',
  'secrets manager':  'aws/Security-Identity/Arch_AWS-Secrets-Manager_48.svg',
  'secretsmanager':   'aws/Security-Identity/Arch_AWS-Secrets-Manager_48.svg',
  'waf':              'aws/Security-Identity/Arch_AWS-WAF_48.svg',
  'kms':              'aws/Security-Identity/Arch_AWS-Key-Management-Service_48.svg',
  'cloudwatch':       'aws/Management-Tools/Arch_Amazon-CloudWatch_48.svg',
  'cloudtrail':       'aws/Management-Tools/Arch_AWS-CloudTrail_48.svg',
  'cloudformation':   'aws/Management-Tools/Arch_AWS-CloudFormation_48.svg',
  'kinesis':          'aws/Analytics/Arch_Amazon-Kinesis_48.svg',
  'redshift':         'aws/Analytics/Arch_Amazon-Redshift_48.svg',
  'glue':             'aws/Analytics/Arch_AWS-Glue_48.svg',
  'athena':           'aws/Analytics/Arch_Amazon-Athena_48.svg',
  'sagemaker':        'aws/Artificial-Intelligence/Arch_Amazon-SageMaker_48.svg',
  'bedrock':          'aws/Artificial-Intelligence/Arch_Amazon-Bedrock_48.svg',
  'ses':              'aws/Business-Applications/Arch_Amazon-Simple-Email-Service_48.svg',
};

// --------------------------------------------------------------------------
// Generic tech icon paths
// --------------------------------------------------------------------------

const TECH_ICONS: Record<string, string> = {
  'postgresql':  'tech/postgresql.svg',
  'postgres':    'tech/postgresql.svg',
  'redis':       'tech/redis.svg',
  'kafka':       'tech/kafka.svg',
  'rabbitmq':    'tech/rabbitmq.svg',
  'nginx':       'tech/nginx.svg',
  'docker':      'tech/docker.svg',
  'kubernetes':  'tech/kubernetes.svg',
  'k8s':         'tech/kubernetes.svg',
};

// --------------------------------------------------------------------------
// Merged lookup table (tech icons take precedence for ambiguous names)
// --------------------------------------------------------------------------

const ALL_ICONS: Record<string, string> = { ...AWS_ICONS, ...TECH_ICONS };

// --------------------------------------------------------------------------
// Prefix stripping for fuzzy matching
// --------------------------------------------------------------------------

const STRIP_PREFIXES = [
  'amazon ',
  'aws ',
  'google ',
  'azure ',
  'cloud ',
];

function normalise(input: string): string {
  let s = input.toLowerCase().trim();
  for (const prefix of STRIP_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
    }
  }
  return s;
}

// Mapping of common long names / aliases to canonical keys
const ALIASES: Record<string, string> = {
  'simple storage service':          's3',
  'simple queue service':            'sqs',
  'simple notification service':     'sns',
  'simple email service':            'ses',
  'relational database service':     'rds',
  'elastic container service':       'ecs',
  'elastic kubernetes service':      'eks',
  'elastic container registry':      'ecr',
  'application load balancer':       'alb',
  'elastic load balancer':           'elb',
  'elastic load balancing':          'elb',
  'virtual private cloud':           'vpc',
  'identity and access management':  'iam',
  'key management service':          'kms',
  'web application firewall':        'waf',
  'ec2 auto scaling':                'auto scaling',
  'auto scaling group':              'auto scaling',
  'api gw':                          'api gateway',
  'apigateway':                      'api gateway',
  'secret manager':                  'secrets manager',
  'step function':                   'step functions',
  'stepfunctions':                   'step functions',
};

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Look up the full CDN URL for a cloud service or technology icon.
 *
 * Supports fuzzy matching:
 *  - "Amazon RDS"           -> rds
 *  - "Application Load Balancer" -> alb
 *  - "EC2"                  -> ec2
 *  - "postgres"             -> postgresql
 *
 * @param service  Human-readable service name
 * @param provider Optional provider hint (unused for now; reserved for
 *                 multi-provider icon sets that share a name)
 * @returns Full CDN URL or null if no icon is registered
 */
export function getIconUrl(service: string, _provider?: string): string | null {
  const normalised = normalise(service);

  // Direct hit
  const directPath = ALL_ICONS[normalised];
  if (directPath) return `${CDN_BASE}/${directPath}`;

  // Alias hit
  const aliasKey = ALIASES[normalised];
  if (aliasKey) {
    const aliasPath = ALL_ICONS[aliasKey];
    if (aliasPath) return `${CDN_BASE}/${aliasPath}`;
  }

  // Substring match — walk the canonical keys and check if the normalised
  // input contains (or is contained by) a key. Prefer exact substring over
  // partial overlap.
  for (const [key, path] of Object.entries(ALL_ICONS)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return `${CDN_BASE}/${path}`;
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Provider accent colours
// --------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  aws:     '#FF9900',
  gcp:     '#4285F4',
  azure:   '#0078D4',
  generic: '#858585',
};

/**
 * Return a hex colour associated with a cloud provider.
 * Falls back to the generic grey for unknown providers.
 */
export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? PROVIDER_COLORS.generic;
}
